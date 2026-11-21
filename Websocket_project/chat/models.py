from django.db import models
from django.contrib.auth.models import User


# class ChatRoom(models.Model):

#     name = models.CharField(max_length=100)

#     created_at = models.DateTimeField(
#         auto_now_add=True
#     )

#     def __str__(self):
#         return self.name

class ChatRoom(models.Model):

    name = models.CharField(max_length=100)

    members = models.ManyToManyField(
        User,
        related_name="chat_rooms"
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )


class Message(models.Model):

    room = models.ForeignKey(
        ChatRoom,
        on_delete=models.CASCADE,
        related_name="messages"
    )

    sender = models.ForeignKey(
        User,
        on_delete=models.CASCADE
    )

    content = models.TextField()

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    def __str__(self):
        return self.content[:50]