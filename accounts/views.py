from django.shortcuts import render, get_object_or_404, redirect
from django.http import HttpResponse
from django.contrib import messages
from django.db.models import Q
import bcrypt

from .models import Account, Role


COUNTRIES = [
    "United States", "United Kingdom", "Spain", "Germany", "France",
    "Italy", "Canada", "Australia", "Japan", "South Korea",
    "Brazil", "Mexico", "India", "China", "Singapore",
    "Switzerland", "Netherlands", "Sweden", "Ireland", "Portugal",
]


def dashboard(request):
    accounts = Account.objects.prefetch_related("roles").all()
    total = accounts.count()
    gps = sum(1 for a in accounts if a.roles.filter(name="gp").exists())
    lps = sum(1 for a in accounts if a.roles.filter(name="lp").exists())
    recent = accounts[:5]
    return render(request, "dashboard.html", {
        "total_users": total,
        "total_gps": gps,
        "total_lps": lps,
        "recent_accounts": recent,
        "active_page": "dashboard",
    })


def account_list(request):
    search = request.GET.get("search", "")
    role_filter = request.GET.get("role", "all")

    accounts = Account.objects.prefetch_related("roles").all()

    if search:
        accounts = accounts.filter(
            Q(first_name__icontains=search) |
            Q(last_name__icontains=search) |
            Q(email__icontains=search)
        )

    if role_filter != "all":
        accounts = accounts.filter(roles__name=role_filter).distinct()

    template = "accounts/_table.html" if request.htmx else "accounts/list.html"
    return render(request, template, {
        "accounts": accounts,
        "search": search,
        "role_filter": role_filter,
        "active_page": "accounts",
    })


def account_detail(request, pk):
    account = get_object_or_404(Account.objects.prefetch_related("roles"), pk=pk)
    tab = request.GET.get("tab", "personal")
    return render(request, "accounts/detail.html", {
        "account": account,
        "active_tab": tab,
        "countries": COUNTRIES,
        "roles": Role.objects.all(),
        "active_page": "accounts",
    })


def account_edit(request, pk):
    account = get_object_or_404(Account.objects.prefetch_related("roles"), pk=pk)
    tab = request.POST.get("tab", "personal")

    if request.method == "POST":
        account.first_name = request.POST.get("first_name", account.first_name)
        account.last_name = request.POST.get("last_name", account.last_name)
        account.email = request.POST.get("email", account.email)
        account.phone = request.POST.get("phone", "")
        birthdate = request.POST.get("birthdate", "")
        account.birthdate = birthdate if birthdate else None
        account.tax_id = request.POST.get("tax_id", "")
        account.street_address_1 = request.POST.get("street_address_1", "")
        account.street_address_2 = request.POST.get("street_address_2", "")
        account.country = request.POST.get("country", "")
        account.city = request.POST.get("city", "")
        account.state_province = request.POST.get("state_province", "")
        account.zip_postal_code = request.POST.get("zip_postal_code", "")
        account.profile_complete = account.is_profile_complete
        account.save()

        role_names = request.POST.getlist("roles")
        account.roles.set(Role.objects.filter(name__in=role_names))

        messages.success(request, "Account updated successfully.")
        return redirect("account_detail", pk=pk)

    return render(request, "accounts/detail.html", {
        "account": account,
        "editing": True,
        "active_tab": tab,
        "countries": COUNTRIES,
        "roles": Role.objects.all(),
        "active_page": "accounts",
    })


def account_create(request):
    if request.method == "POST":
        email = request.POST.get("email", "").strip()
        password = request.POST.get("password", "").strip()
        first_name = request.POST.get("first_name", "").strip()
        last_name = request.POST.get("last_name", "").strip()

        if not all([email, password, first_name, last_name]):
            messages.error(request, "First name, last name, email, and password are required.")
            return render(request, "accounts/create.html", {
                "countries": COUNTRIES,
                "roles": Role.objects.all(),
                "form_data": request.POST,
                "active_page": "accounts",
            })

        if Account.objects.filter(email=email).exists():
            messages.error(request, "An account with this email already exists.")
            return render(request, "accounts/create.html", {
                "countries": COUNTRIES,
                "roles": Role.objects.all(),
                "form_data": request.POST,
                "active_page": "accounts",
            })

        hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

        account = Account.objects.create(
            email=email,
            password_hash=hashed,
            first_name=first_name,
            last_name=last_name,
            phone=request.POST.get("phone", ""),
            birthdate=request.POST.get("birthdate") or None,
            tax_id=request.POST.get("tax_id", ""),
            street_address_1=request.POST.get("street_address_1", ""),
            street_address_2=request.POST.get("street_address_2", ""),
            country=request.POST.get("country", ""),
            city=request.POST.get("city", ""),
            state_province=request.POST.get("state_province", ""),
            zip_postal_code=request.POST.get("zip_postal_code", ""),
        )
        account.profile_complete = account.is_profile_complete
        account.save()

        role_names = request.POST.getlist("roles")
        if role_names:
            account.roles.set(Role.objects.filter(name__in=role_names))

        messages.success(request, "Account created successfully.")
        return redirect("account_detail", pk=account.pk)

    return render(request, "accounts/create.html", {
        "countries": COUNTRIES,
        "roles": Role.objects.all(),
        "active_page": "accounts",
    })


def account_delete(request, pk):
    account = get_object_or_404(Account, pk=pk)
    if request.method == "POST":
        account.delete()
        messages.success(request, "Account deleted successfully.")
        return redirect("account_list")
    return redirect("account_detail", pk=pk)
