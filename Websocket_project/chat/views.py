from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from .models import ChatRoom, Message
from .serializers import (
    ChatRoomSerializer,
    MessageSerializer
)


class ChatRoomListCreateView(generics.ListCreateAPIView):

    queryset = ChatRoom.objects.all()

    serializer_class = ChatRoomSerializer

    permission_classes = [IsAuthenticated]


class MessageListView(generics.ListAPIView):

    serializer_class = MessageSerializer

    permission_classes = [IsAuthenticated]

    def get_queryset(self):

        room_id = self.kwargs["room_id"]

        return Message.objects.filter(
            room_id=room_id
        ).select_related(
            "sender",
            "room"
        ).order_by("created_at")