import { useEffect, useState } from "react";

function Chat() {

    const [messages, setMessages] = useState([]);

    const [message, setMessage] = useState("");

    const [socket, setSocket] = useState(null);

    const roomId = 1;


    // Fetch old messages using DRF
    useEffect(() => {

        fetch(`/api/rooms/${roomId}/messages/`, {
            credentials: "include",
        })
        .then(response => {

            if (!response.ok) {
                throw new Error("Unable to load messages");
            }

            return response.json();

        })
        .then(data => {

            setMessages(data);

        })
        .catch(error => console.error(error));

    }, []);


    // Connect WebSocket
    useEffect(() => {

        const ws = new WebSocket(
            `ws://${window.location.host}/ws/chat/${roomId}/`
        );

        ws.onopen = () => {

            console.log("WebSocket Connected");

        };

        ws.onmessage = (event) => {

            const data = JSON.parse(event.data);

            setMessages(previous => [

                ...previous,

                {
                    username: data.username,
                    content: data.message,
                    created_at: data.created_at,
                }

            ]);

        };

        ws.onerror = (error) => {

            console.error("WebSocket Error:", error);

        };

        ws.onclose = () => {

            console.log("WebSocket Disconnected");

        };

        setSocket(ws);

        return () => {

            ws.close();

        };

    }, []);


    // Send message
    const sendMessage = () => {

        if (
            socket &&
            socket.readyState === WebSocket.OPEN &&
            message.trim()
        ) {

            socket.send(JSON.stringify({

                message: message,

            }));

            setMessage("");

        }

    };


    return (

        <div style={{ padding: "30px" }}>

            <h2>Real-Time Chat Application</h2>

            <div
                style={{
                    border: "1px solid gray",
                    height: "350px",
                    overflowY: "auto",
                    padding: "15px"
                }}
            >

                {messages.map((msg, index) => (

                    <div key={msg.id ?? `${msg.created_at}-${index}`}>

                        <b>{msg.username}</b>

                        <p>{msg.content}</p>

                        <hr />

                    </div>

                ))}

            </div>


            <input

                value={message}

                onChange={(e) => setMessage(e.target.value)}

                placeholder="Enter your message"

            />


            <button onClick={sendMessage}>

                Send

            </button>

        </div>

    );

}

export default Chat;