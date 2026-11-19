import json

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async

from .models import ChatRoom, Message


class ChatConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):

        self.room_id = self.scope["url_route"]["kwargs"]["room_id"]

        self.room_group_name = f"chat_{self.room_id}"

        user = self.scope["user"]

        # Check authentication
        if not user.is_authenticated:
            await self.close()
            return

        # Check room exists
        room_exists = await self.check_room()

        if not room_exists:
            await self.close()
            return

        # Add user to room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        # Accept WebSocket connection
        await self.accept()

    async def disconnect(self, close_code):

        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive_json(self, content):

        message = content.get("message")

        if not message or not message.strip():
            return

        user = self.scope["user"]

        # Save message in database
        saved_message = await self.save_message(
            user.id,
            message.strip()
        )

        # Broadcast message to all room members
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "chat_message",
                "message": saved_message["content"],
                "username": saved_message["username"],
                "created_at": saved_message["created_at"],
            }
        )

    async def chat_message(self, event):

        # Send message to WebSocket clients
        await self.send_json({
            "type": "chat_message",
            "message": event["message"],
            "username": event["username"],
            "created_at": event["created_at"],
        })

    @database_sync_to_async
    def check_room(self):

        return ChatRoom.objects.filter(
            id=self.room_id
        ).exists()

    @database_sync_to_async
    def save_message(self, user_id, message):

        user = self.scope["user"]

        obj = Message.objects.create(
            room_id=self.room_id,
            sender_id=user_id,
            content=message
        )

        return {
            "content": obj.content,
            "username": user.username,
            "created_at": obj.created_at.isoformat()
        }