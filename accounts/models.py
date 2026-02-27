from django.db import models


class Role(models.Model):
    ADMIN = "admin"
    GP = "gp"
    LP = "lp"
    ROLE_CHOICES = [
        (ADMIN, "Admin"),
        (GP, "GP (General Partner)"),
        (LP, "LP (Limited Partner)"),
    ]

    name = models.CharField(max_length=50, unique=True, choices=ROLE_CHOICES)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.get_name_display()

    class Meta:
        db_table = "account_roles"


class Account(models.Model):
    email = models.EmailField(unique=True)
    password_hash = models.CharField(max_length=255)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    phone = models.CharField(max_length=50, blank=True, default="")
    birthdate = models.DateField(null=True, blank=True)
    tax_id = models.CharField(max_length=50, blank=True, default="")
    street_address_1 = models.CharField(max_length=255, blank=True, default="")
    street_address_2 = models.CharField(max_length=255, blank=True, default="")
    country = models.CharField(max_length=100, blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="")
    state_province = models.CharField(max_length=100, blank=True, default="")
    zip_postal_code = models.CharField(max_length=20, blank=True, default="")
    profile_complete = models.BooleanField(default=False)
    roles = models.ManyToManyField(Role, blank=True, related_name="accounts")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.first_name} {self.last_name}"

    @property
    def initials(self):
        f = self.first_name[0] if self.first_name else ""
        l = self.last_name[0] if self.last_name else ""
        return f"{f}{l}".upper()

    @property
    def is_profile_complete(self):
        required = [self.first_name, self.last_name, self.email,
                    self.street_address_1, self.country, self.city,
                    self.state_province, self.zip_postal_code]
        return all(required)

    class Meta:
        db_table = "account_accounts"
        ordering = ["-created_at"]
