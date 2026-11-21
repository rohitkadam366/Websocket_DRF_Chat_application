from django.contrib import admin

from .models import ChatRoom, Message


@admin.register(ChatRoom)
class ChatRoomAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "created_at")
    search_fields = ("name",)
    ordering = ("name",)


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "room", "sender", "created_at")
    list_filter = ("room", "created_at")
    search_fields = ("content", "sender__username", "room__name")
    readonly_fields = ("created_at",)
    ordering = ("-created_at",)
