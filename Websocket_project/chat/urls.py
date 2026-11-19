from django.urls import path

from .views import (
    ChatRoomListCreateView,
    MessageListView
)


urlpatterns = [

    path(
        "rooms/",
        ChatRoomListCreateView.as_view(),
        name="rooms"
    ),

    path(
        "rooms/<int:room_id>/messages/",
        MessageListView.as_view(),
        name="messages"
    ),

]