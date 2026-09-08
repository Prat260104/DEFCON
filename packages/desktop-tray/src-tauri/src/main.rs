#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use std::env;
use std::sync::Arc;
use std::time::Duration;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tokio::sync::mpsc;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message as WsMessage;

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
struct AgentEvent {
    #[serde(default)]
    agent: Option<String>,
    #[serde(rename = "type", default)]
    event_type: Option<String>,
    #[serde(default)]
    command: Option<String>,
    #[serde(rename = "riskLevel", default)]
    risk_level: Option<String>,
    #[serde(default)]
    timestamp: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
#[allow(dead_code)]
enum ServerMessage {
    #[serde(rename = "init")]
    Init {
        active: bool,
        #[serde(rename = "pendingEvent")]
        pending_event: Option<AgentEvent>,
        #[serde(rename = "soundEnabled", default)]
        sound_enabled: Option<bool>,
        #[serde(default)]
        version: Option<String>,
    },
    #[serde(rename = "state")]
    State {
        active: bool,
        #[serde(rename = "pendingEvent")]
        pending_event: Option<AgentEvent>,
    },
    #[serde(rename = "event")]
    Event {
        event: AgentEvent,
    },
    #[serde(rename = "stall")]
    Stall {
        #[serde(default)]
        level: Option<u32>,
        #[serde(default)]
        seconds: Option<u32>,
        #[serde(default)]
        sound: Option<String>,
    },
    #[serde(rename = "shutdown_ack")]
    ShutdownAck,
    #[serde(rename = "pong")]
    Pong,
    #[serde(other)]
    Unknown,
}

enum ClientAction {
    Shutdown,
    TestSound,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum TrayState {
    Disconnected,
    Idle,
    MediumRisk,
    HighRisk,
}

struct TrayUi {
    app_handle: tauri::AppHandle,
    header_item: MenuItem<tauri::Wry>,
    detail_item: MenuItem<tauri::Wry>,
    idle_icon: Image<'static>,
    medium_icon: Image<'static>,
    high_icon: Image<'static>,
}

impl TrayUi {
    fn update(&self, state: TrayState, header: &str, detail: &str, tooltip: &str) {
        let _ = self.header_item.set_text(header);
        let _ = self.detail_item.set_text(detail);

        if let Some(tray) = self.app_handle.tray_by_id("main-tray") {
            let icon = match state {
                TrayState::Disconnected | TrayState::Idle => &self.idle_icon,
                TrayState::MediumRisk => &self.medium_icon,
                TrayState::HighRisk => &self.high_icon,
            };
            let _ = tray.set_icon(Some(icon.clone()));
            let _ = tray.set_tooltip(Some(tooltip));
        }
    }
}

fn truncate_str(s: &str, max_len: usize) -> String {
    if s.chars().count() > max_len {
        let truncated: String = s.chars().take(max_len - 3).collect();
        format!("{}...", truncated)
    } else {
        s.to_string()
    }
}

fn determine_event_state(event: &AgentEvent) -> (TrayState, String, String, String) {
    let risk = event.risk_level.as_deref().unwrap_or("low");
    let cmd = event.command.as_deref().unwrap_or("(no command)");
    let agent_name = event.agent.as_deref().unwrap_or("Agent");
    let short_cmd = truncate_str(cmd, 35);

    if risk.eq_ignore_ascii_case("high") {
        (
            TrayState::HighRisk,
            "🚨 HIGH RISK ACTION PENDING".to_string(),
            format!("{}: {}", agent_name, short_cmd),
            format!("DEFCON: High Risk Alert - {}", short_cmd),
        )
    } else {
        (
            TrayState::MediumRisk,
            "⚡ Permission Required".to_string(),
            format!("{}: {}", agent_name, short_cmd),
            format!("DEFCON: Permission Required - {}", short_cmd),
        )
    }
}

fn main() {
    let idle_png = include_bytes!("../icons/tray-idle.png");
    let medium_png = include_bytes!("../icons/tray-medium.png");
    let high_png = include_bytes!("../icons/tray-high.png");

    let idle_icon = Image::from_bytes(idle_png).expect("Valid idle icon PNG");
    let medium_icon = Image::from_bytes(medium_png).expect("Valid medium icon PNG");
    let high_icon = Image::from_bytes(high_png).expect("Valid high icon PNG");

    let (action_tx, mut action_rx) = mpsc::channel::<ClientAction>(16);
    let action_tx_for_menu = action_tx.clone();

    let _ = tauri::Builder::default()
        .setup(move |app| {
            let header_item = MenuItem::with_id(
                app,
                "header",
                "🛡️ DEFCON: Active",
                false,
                None::<&str>,
            )?;
            let detail_item = MenuItem::with_id(
                app,
                "detail",
                "Monitoring coding agents",
                false,
                None::<&str>,
            )?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let test_sound_item = MenuItem::with_id(
                app,
                "test_sound",
                "🔔 Test Alert Sound",
                true,
                None::<&str>,
            )?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(
                app,
                "quit",
                "Quit DEFCON",
                true,
                None::<&str>,
            )?;

            let menu = Menu::with_items(
                app,
                &[
                    &header_item,
                    &detail_item,
                    &sep1,
                    &test_sound_item,
                    &sep2,
                    &quit_item,
                ],
            )?;

            let action_sender = action_tx_for_menu.clone();
            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(idle_icon.clone())
                .tooltip("DEFCON: Monitoring coding agents")
                .menu(&menu)
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "quit" => {
                            println!("[tray] Menu action: 'Quit DEFCON' clicked");
                            if action_sender.try_send(ClientAction::Shutdown).is_err() {
                                // If background loop channel full or dead, exit immediately
                                app.exit(0);
                            }
                        }
                        "test_sound" => {
                            println!("[tray] Menu action: 'Test Alert Sound' clicked");
                            if let Err(e) = action_sender.try_send(ClientAction::TestSound) {
                                eprintln!("[tray] Failed to dispatch TestSound: {e}");
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            let ui = Arc::new(TrayUi {
                app_handle: app.handle().clone(),
                header_item,
                detail_item,
                idle_icon,
                medium_icon,
                high_icon,
            });

            let app_handle_for_ws = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                let ws_url = env::var("DEFCON_WS_URL")
                    .unwrap_or_else(|_| "ws://127.0.0.1:48123".to_string());

                loop {
                    // Try to connect to WebSocket server
                    match connect_async(&ws_url).await {
                        Ok((ws_stream, _)) => {
                            let (mut write_half, mut read_half) = ws_stream.split();

                            ui.update(
                                TrayState::Idle,
                                "🛡️ DEFCON: Active",
                                "Connected to daemon",
                                "DEFCON: Monitoring coding agents",
                            );

                            let mut ping_interval = tokio::time::interval(Duration::from_secs(15));
                            // consume immediate first tick
                            ping_interval.tick().await;

                            let mut connection_closed = false;

                            while !connection_closed {
                                tokio::select! {
                                    _ = ping_interval.tick() => {
                                        let ping_payload = serde_json::json!({ "type": "ping" }).to_string();
                                        if write_half.send(WsMessage::Text(ping_payload.into())).await.is_err() {
                                            connection_closed = true;
                                        }
                                    }

                                    action = action_rx.recv() => {
                                        match action {
                                            Some(ClientAction::TestSound) => {
                                                println!("[tray] Dispatching 'test_sound' (tier: high) to daemon over WebSocket...");
                                                let payload = serde_json::json!({
                                                    "type": "test_sound",
                                                    "tier": "high"
                                                }).to_string();
                                                if let Err(e) = write_half.send(WsMessage::Text(payload.into())).await {
                                                    eprintln!("[tray] Failed to send test_sound message: {e}");
                                                } else {
                                                    println!("[tray] 'test_sound' message sent successfully.");
                                                }
                                            }
                                            Some(ClientAction::Shutdown) => {
                                                println!("[tray] Dispatching 'shutdown' to daemon over WebSocket...");
                                                // Send shutdown message to daemon
                                                let payload = serde_json::json!({ "type": "shutdown" }).to_string();
                                                let _ = write_half.send(WsMessage::Text(payload.into())).await;

                                                // Wait for shutdown_ack with 2.5 second fail-safe timeout
                                                let deadline = tokio::time::Instant::now() + Duration::from_millis(2500);
                                                loop {
                                                    let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
                                                    if remaining.is_zero() {
                                                        break;
                                                    }

                                                    tokio::select! {
                                                        _ = tokio::time::sleep(remaining) => {
                                                            break;
                                                        }
                                                        incoming = read_half.next() => {
                                                            match incoming {
                                                                Some(Ok(WsMessage::Text(txt))) => {
                                                                    if let Ok(ServerMessage::ShutdownAck) = serde_json::from_str::<ServerMessage>(&txt) {
                                                                        break;
                                                                    }
                                                                }
                                                                Some(Ok(WsMessage::Close(_))) | None => {
                                                                    // Server closed, clean exit
                                                                    break;
                                                                }
                                                                _ => {}
                                                            }
                                                        }
                                                    }
                                                }

                                                // Clean exit
                                                app_handle_for_ws.exit(0);
                                                return;
                                            }
                                            None => {
                                                // Receiver closed
                                                connection_closed = true;
                                            }
                                        }
                                    }

                                    incoming = read_half.next() => {
                                        match incoming {
                                            Some(Ok(WsMessage::Text(txt))) => {
                                                if let Ok(msg) = serde_json::from_str::<ServerMessage>(&txt) {
                                                    match msg {
                                                        ServerMessage::Init { pending_event, .. } | ServerMessage::State { pending_event, .. } => {
                                                            if let Some(event) = pending_event {
                                                                let (st, h, d, tip) = determine_event_state(&event);
                                                                ui.update(st, &h, &d, &tip);
                                                            } else {
                                                                ui.update(
                                                                    TrayState::Idle,
                                                                    "🛡️ DEFCON: Active",
                                                                    "All agents normal",
                                                                    "DEFCON: Monitoring coding agents",
                                                                );
                                                            }
                                                        }
                                                        ServerMessage::Event { event } => {
                                                            let event_type = event.event_type.as_deref().unwrap_or("");
                                                            if event_type == "permission_required" {
                                                                let (st, h, d, tip) = determine_event_state(&event);
                                                                ui.update(st, &h, &d, &tip);
                                                            } else if event_type == "completed" || event_type == "idle" {
                                                                ui.update(
                                                                    TrayState::Idle,
                                                                    "🛡️ DEFCON: Active",
                                                                    "All agents normal",
                                                                    "DEFCON: Monitoring coding agents",
                                                                );
                                                            }
                                                        }
                                                        ServerMessage::Stall { seconds, sound, .. } => {
                                                            let sec = seconds.unwrap_or(30);
                                                            let snd = sound.unwrap_or_else(|| "Sosumi".to_string());
                                                            ui.update(
                                                                TrayState::MediumRisk,
                                                                "⏳ AGENT STALLED",
                                                                &format!("Stalled for {}s ({})", sec, snd),
                                                                &format!("DEFCON: Stall alert ({}s)", sec),
                                                            );
                                                        }
                                                        ServerMessage::ShutdownAck => {
                                                            app_handle_for_ws.exit(0);
                                                            return;
                                                        }
                                                        ServerMessage::Pong | ServerMessage::Unknown => {}
                                                    }
                                                }
                                            }
                                            Some(Ok(WsMessage::Close(_))) | None => {
                                                connection_closed = true;
                                            }
                                            Some(Err(_)) => {
                                                connection_closed = true;
                                            }
                                            _ => {}
                                        }
                                    }
                                }
                            }
                        }
                        Err(_) => {
                            // Connection failed
                        }
                    }

                    // If disconnected, show disconnected UI state
                    ui.update(
                        TrayState::Disconnected,
                        "🔌 DEFCON: Reconnecting...",
                        "Daemon not reachable",
                        "DEFCON: Reconnecting to daemon...",
                    );

                    // Check if shutdown was requested while disconnected
                    tokio::select! {
                        action = action_rx.recv() => {
                            if let Some(ClientAction::Shutdown) = action {
                                app_handle_for_ws.exit(0);
                                return;
                            }
                        }
                        _ = tokio::time::sleep(Duration::from_millis(1500)) => {}
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!());
}
