from django.contrib import admin
from .models import Account, Role


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ["name", "description"]


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ["email", "first_name", "last_name", "profile_complete"]
    list_filter = ["profile_complete", "roles"]
    search_fields = ["email", "first_name", "last_name"]
