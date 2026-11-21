import { useEffect, useRef, useState } from "react";
import "./App.css";

function messageSignature(message) {
    const time = Date.parse(message.created_at);
    return `${Number.isNaN(time) ? message.created_at : time}:${message.username}:${message.content}`;
}

function mergeMessages(...groups) {
    const messagesBySignature = new Map();

    groups.flat().forEach((message) => {
        messagesBySignature.set(messageSignature(message), message);
    });

    return [...messagesBySignature.values()].sort(
        (first, second) => Date.parse(first.created_at) - Date.parse(second.created_at),
    );
}

function getErrorMessage(response) {
    if (response.status === 401 || response.status === 403) {
        return "Sign in to Django first. This backend requires an authenticated session for chat.";
    }

    return `The server returned an error (${response.status}). Please try again.`;
}

function formatTime(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

function Chat() {
    const [rooms, setRooms] = useState([]);
    const [activeRoomId, setActiveRoomId] = useState(null);
    const [roomsLoading, setRoomsLoading] = useState(true);
    const [roomsError, setRoomsError] = useState("");
    const [messages, setMessages] = useState([]);
    const [message, setMessage] = useState("");
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [messagesError, setMessagesError] = useState("");
    const [connectionState, setConnectionState] = useState("disconnected");
    const [socketVersion, setSocketVersion] = useState(0);
    const [typingUsers, setTypingUsers] = useState({});
    const socketRef = useRef(null);
    const feedRef = useRef(null);
    const typingTimerRef = useRef(null);
    const typingUsersTimersRef = useRef({});

    useEffect(() => {
        const controller = new AbortController();

        async function loadRooms() {
            setRoomsLoading(true);
            setRoomsError("");

            try {
                const response = await fetch("/api/rooms/", {
                    credentials: "include",
                    signal: controller.signal,
                });

                if (!response.ok) {
                    throw new Error(getErrorMessage(response));
                }

                const data = await response.json();
                const roomList = Array.isArray(data) ? data : data.results;

                if (!Array.isArray(roomList)) {
                    throw new Error("The rooms endpoint returned an unexpected response.");
                }

                setRooms(roomList);
                setActiveRoomId((currentRoomId) =>
                    roomList.some((room) => room.id === currentRoomId)
                        ? currentRoomId
                        : roomList[0]?.id ?? null,
                );
            } catch (error) {
                if (error.name !== "AbortError") {
                    setRoomsError(error.message || "Unable to load chat rooms.");
                }
            } finally {
                if (!controller.signal.aborted) {
                    setRoomsLoading(false);
                }
            }
        }

        loadRooms();
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (activeRoomId === null) {
            setMessages([]);
            setConnectionState("disconnected");
            return undefined;
        }

        let isCurrent = true;
        let liveMessages = [];
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const socket = new WebSocket(
            `${protocol}//${window.location.host}/ws/chat/${activeRoomId}/`,
        );

        socketRef.current = socket;
        setMessages([]);
        setMessagesError("");
        setMessagesLoading(true);
        setConnectionState("connecting");

        socket.onopen = () => {
            if (isCurrent) {
                setConnectionState("connected");
            }
        };

        socket.onmessage = (event) => {
            if (!isCurrent) {
                return;
            }

            try {
                const data = JSON.parse(event.data);

                if (data.type === "typing") {
                    const username = data.username;
                    if (!username) {
                        return;
                    }

                    if (typingUsersTimersRef.current[username]) {
                        clearTimeout(typingUsersTimersRef.current[username]);
                    }

                    if (data.is_typing) {
                        setTypingUsers((current) => ({ ...current, [username]: true }));
                        typingUsersTimersRef.current[username] = setTimeout(() => {
                            setTypingUsers((current) => {
                                const next = { ...current };
                                delete next[username];
                                return next;
                            });
                        }, 3000);
                    } else {
                        setTypingUsers((current) => {
                            const next = { ...current };
                            delete next[username];
                            return next;
                        });
                    }
                    return;
                }

                if (data.type !== "chat_message") {
                    return;
                }

                const incomingMessage = {
                    username: data.username,
                    content: data.message,
                    created_at: data.created_at,
                };

                liveMessages = mergeMessages(liveMessages, [incomingMessage]);
                setMessages((currentMessages) =>
                    mergeMessages(currentMessages, [incomingMessage]),
                );
            } catch {
                setMessagesError("Received an unreadable message from the server.");
            }
        };

        socket.onerror = () => {
            if (isCurrent) {
                setConnectionState("error");
            }
        };

        socket.onclose = () => {
            if (isCurrent) {
                setConnectionState("disconnected");
            }
        };

        async function loadMessages() {
            try {
                const response = await fetch(`/api/rooms/${activeRoomId}/messages/`, {
                    credentials: "include",
                });

                if (!response.ok) {
                    throw new Error(getErrorMessage(response));
                }

                const data = await response.json();
                const history = Array.isArray(data) ? data : data.results;

                if (!Array.isArray(history)) {
                    throw new Error("The messages endpoint returned an unexpected response.");
                }

                if (isCurrent) {
                    setMessages(mergeMessages(history, liveMessages));
                }
            } catch (error) {
                if (isCurrent) {
                    setMessagesError(error.message || "Unable to load message history.");
                }
            } finally {
                if (isCurrent) {
                    setMessagesLoading(false);
                }
            }
        }

        loadMessages();

        return () => {
            isCurrent = false;
            socketRef.current = null;
            if (typingTimerRef.current) {
                clearTimeout(typingTimerRef.current);
            }
            socket.close();
        };
    }, [activeRoomId, socketVersion]);

    useEffect(() => {
        setTypingUsers({});
        Object.values(typingUsersTimersRef.current).forEach(clearTimeout);
        typingUsersTimersRef.current = {};
    }, [activeRoomId]);

    useEffect(() => {
        if (feedRef.current) {
            feedRef.current.scrollTop = feedRef.current.scrollHeight;
        }
    }, [messages]);

    function sendMessage(event) {
        event.preventDefault();
        const text = message.trim();
        const socket = socketRef.current;

        if (!text || !socket || socket.readyState !== WebSocket.OPEN) {
            return;
        }

        try {
            if (typingTimerRef.current) {
                clearTimeout(typingTimerRef.current);
            }
            socket.send(JSON.stringify({ type: "typing", is_typing: false }));
            socket.send(JSON.stringify({ type: "chat_message", message: text }));
            setMessage("");
            setMessagesError("");
        } catch {
            setMessagesError("Your message could not be sent. Please reconnect and try again.");
        }
    }

    const activeRoom = rooms.find((room) => room.id === activeRoomId);
    const canSend = connectionState === "connected" && message.trim().length > 0;

    return (
        <main className="chat-shell">
            <header className="app-header">
                <a className="brand" href="/" aria-label="Chat home">
                    <span className="brand-mark" aria-hidden="true">C</span>
                    <span>Convo</span>
                </a>
                <div className="header-caption">A little more connected.</div>
                <div className="header-actions">
                    <a
                        className="admin-link"
                        href="/admin/"
                        rel="noreferrer"
                        target="_blank"
                    >
                        Django Admin
                    </a>
                    <span className={`connection-pill connection-${connectionState}`}>
                        <span className="connection-dot" />
                        {connectionState === "connected"
                            ? "Live"
                            : connectionState === "connecting"
                              ? "Connecting"
                              : connectionState === "error"
                                ? "Connection issue"
                                : "Offline"}
                    </span>
                </div>
            </header>

            <section className="chat-layout" aria-label="Chat application">
                <aside className="room-panel">
                    <div className="panel-heading">
                        <div>
                            <p className="eyebrow">YOUR WORKSPACE</p>
                            <h1>Messages</h1>
                        </div>
                        <span className="room-count">{rooms.length}</span>
                    </div>

                    <p className="section-label">CHAT ROOMS</p>
                    {roomsLoading && <p className="panel-message">Loading rooms…</p>}
                    {roomsError && (
                        <div className="inline-error" role="alert">
                            <p>{roomsError}</p>
                            {roomsError.includes("Sign in") && (
                                <a href="/admin/login/" target="_blank" rel="noreferrer">
                                    Open Django sign in
                                </a>
                            )}
                        </div>
                    )}
                    {!roomsLoading && !roomsError && rooms.length === 0 && (
                        <p className="panel-message">
                            No rooms yet. Create a room in the Django admin to get started.
                        </p>
                    )}

                    <nav className="room-list" aria-label="Chat rooms">
                        {rooms.map((room) => (
                            <button
                                className={`room-button${room.id === activeRoomId ? " room-button-active" : ""}`}
                                key={room.id}
                                onClick={() => setActiveRoomId(room.id)}
                                type="button"
                            >
                                <span className="room-avatar" aria-hidden="true">
                                    {room.name?.trim().charAt(0).toUpperCase() || "#"}
                                </span>
                                <span className="room-name">{room.name}</span>
                                <span className="room-chevron" aria-hidden="true">›</span>
                            </button>
                        ))}
                    </nav>
                    <p className="sidebar-note">Your conversations, all in one place.</p>
                </aside>

                <section className="conversation-panel" aria-label="Conversation">
                    <div className="conversation-header">
                        <div className="room-avatar room-avatar-large" aria-hidden="true">
                            {activeRoom?.name?.trim().charAt(0).toUpperCase() || "#"}
                        </div>
                        <div className="conversation-title">
                            <h2>{activeRoom?.name || "Choose a room"}</h2>
                            <p>
                                {activeRoom
                                    ? connectionState === "connected"
                                        ? "Messages appear here in real time"
                                        : "Connecting to this conversation…"
                                    : "Select a room to start chatting"}
                            </p>
                        </div>
                        {activeRoom && connectionState !== "connected" && (
                            <button
                                className="reconnect-button"
                                onClick={() => setSocketVersion((version) => version + 1)}
                                type="button"
                            >
                                Reconnect
                            </button>
                        )}
                    </div>

                    <div className="message-feed" ref={feedRef} aria-live="polite">
                        {!activeRoom && !roomsLoading && !roomsError && (
                            <div className="empty-state">
                                <span className="empty-icon" aria-hidden="true">✦</span>
                                <h3>Your next conversation starts here</h3>
                                <p>Choose a chat room from the list to see its messages.</p>
                            </div>
                        )}
                        {activeRoom && messagesLoading && messages.length === 0 && (
                            <div className="feed-notice">Loading conversation…</div>
                        )}
                        {messagesError && (
                            <div className="feed-notice feed-error" role="alert">{messagesError}</div>
                        )}
                        {activeRoom && !messagesLoading && messages.length === 0 && !messagesError && (
                            <div className="empty-state">
                                <span className="empty-icon" aria-hidden="true">✦</span>
                                <h3>It’s quiet in here</h3>
                                <p>Send the first message to get things going.</p>
                            </div>
                        )}
                        {messages.map((item, index) => (
                            <article
                                className="message"
                                key={`${messageSignature(item)}-${index}`}
                            >
                                <span className="message-avatar" aria-hidden="true">
                                    {item.username?.charAt(0).toUpperCase() || "?"}
                                </span>
                                <div className="message-body">
                                    <div className="message-meta">
                                        <strong>{item.username || "Unknown user"}</strong>
                                        <time dateTime={item.created_at}>{formatTime(item.created_at)}</time>
                                    </div>
                                    <p className="message-content">{item.content}</p>
                                </div>
                            </article>
                        ))}
                        {Object.keys(typingUsers).length > 0 && (
                            <div className="typing-indicator" role="status" aria-live="polite">
                                {Object.keys(typingUsers).join(", ")} {Object.keys(typingUsers).length === 1 ? "is" : "are"} typing...
                            </div>
                        )}
                    </div>

                    <form className="composer" onSubmit={sendMessage}>
                        <label className="sr-only" htmlFor="chat-message">Write a message</label>
                        <input
                            autoComplete="off"
                            disabled={!activeRoom || connectionState !== "connected"}
                            id="chat-message"
                            onChange={(event) => {
                                const value = event.target.value;
                                setMessage(value);

                                const socket = socketRef.current;
                                if (value.trim() && socket?.readyState === WebSocket.OPEN) {
                                    socket.send(JSON.stringify({ type: "typing", is_typing: true }));

                                    if (typingTimerRef.current) {
                                        clearTimeout(typingTimerRef.current);
                                    }
                                    typingTimerRef.current = setTimeout(() => {
                                        if (socket.readyState === WebSocket.OPEN) {
                                            socket.send(JSON.stringify({ type: "typing", is_typing: false }));
                                        }
                                    }, 1500);
                                }
                            }}
                            placeholder={
                                connectionState === "connected"
                                    ? "Write a message…"
                                    : "Connect to a room to send a message"
                            }
                            value={message}
                        />
                        <button className="send-button" disabled={!canSend} type="submit">
                            <span>Send</span>
                            <span className="send-arrow" aria-hidden="true">↑</span>
                        </button>
                    </form>
                    <p className="composer-hint">Press Enter to send</p>
                </section>
            </section>
            <footer className="app-footer">Made for conversations that matter.</footer>
        </main>
    );
}

export default Chat;
