import os
from flask import Flask, jsonify, request
from flask_cors import CORS
import psycopg2
import psycopg2.extras
import bcrypt

app = Flask(__name__)
CORS(app)

def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"])


@app.route("/api/users", methods=["GET"])
def get_users():
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT u.*, 
            COALESCE(
                json_agg(json_build_object('id', r.id, 'name', r.name, 'description', r.description))
                FILTER (WHERE r.id IS NOT NULL), '[]'
            ) as roles
        FROM users u
        LEFT JOIN user_roles ur ON u.id = ur.user_id
        LEFT JOIN roles r ON ur.role_id = r.id
        GROUP BY u.id
        ORDER BY u.created_at DESC
    """)
    users = cur.fetchall()
    cur.close()
    conn.close()
    for u in users:
        if u.get("birthdate"):
            u["birthdate"] = u["birthdate"].isoformat()
        if u.get("created_at"):
            u["created_at"] = u["created_at"].isoformat()
        if u.get("updated_at"):
            u["updated_at"] = u["updated_at"].isoformat()
    return jsonify(users)


@app.route("/api/users/<int:user_id>", methods=["GET"])
def get_user(user_id):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT u.*, 
            COALESCE(
                json_agg(json_build_object('id', r.id, 'name', r.name, 'description', r.description))
                FILTER (WHERE r.id IS NOT NULL), '[]'
            ) as roles
        FROM users u
        LEFT JOIN user_roles ur ON u.id = ur.user_id
        LEFT JOIN roles r ON ur.role_id = r.id
        WHERE u.id = %s
        GROUP BY u.id
    """, (user_id,))
    user = cur.fetchone()
    cur.close()
    conn.close()
    if not user:
        return jsonify({"error": "User not found"}), 404
    if user.get("birthdate"):
        user["birthdate"] = user["birthdate"].isoformat()
    if user.get("created_at"):
        user["created_at"] = user["created_at"].isoformat()
    if user.get("updated_at"):
        user["updated_at"] = user["updated_at"].isoformat()
    return jsonify(user)


@app.route("/api/users", methods=["POST"])
def create_user():
    data = request.json
    required = ["email", "first_name", "last_name", "password"]
    for field in required:
        if field not in data:
            return jsonify({"error": f"Missing required field: {field}"}), 400

    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO users (email, password_hash, first_name, last_name, phone, birthdate,
                tax_id, street_address_1, street_address_2, country, city, state_province, zip_postal_code)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
        """, (
            data["email"],
            bcrypt.hashpw(data["password"].encode("utf-8"), bcrypt.gensalt()).decode("utf-8"),
            data["first_name"], data["last_name"],
            data.get("phone"), data.get("birthdate"), data.get("tax_id"),
            data.get("street_address_1"), data.get("street_address_2"),
            data.get("country"), data.get("city"), data.get("state_province"),
            data.get("zip_postal_code")
        ))
        user = cur.fetchone()

        roles = data.get("roles", [])
        if roles:
            for role_name in roles:
                cur.execute("""
                    INSERT INTO user_roles (user_id, role_id)
                    SELECT %s, id FROM roles WHERE name = %s
                    ON CONFLICT DO NOTHING
                """, (user["id"], role_name))

        conn.commit()

        cur.execute("""
            SELECT u.*, 
                COALESCE(
                    json_agg(json_build_object('id', r.id, 'name', r.name, 'description', r.description))
                    FILTER (WHERE r.id IS NOT NULL), '[]'
                ) as roles
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.id
            WHERE u.id = %s
            GROUP BY u.id
        """, (user["id"],))
        user = cur.fetchone()
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        return jsonify({"error": "A user with this email already exists"}), 409
    finally:
        cur.close()
        conn.close()

    if user.get("birthdate"):
        user["birthdate"] = user["birthdate"].isoformat()
    if user.get("created_at"):
        user["created_at"] = user["created_at"].isoformat()
    if user.get("updated_at"):
        user["updated_at"] = user["updated_at"].isoformat()
    return jsonify(user), 201


@app.route("/api/users/<int:user_id>", methods=["PATCH"])
def update_user(user_id):
    data = request.json
    allowed_fields = [
        "first_name", "last_name", "email", "phone", "birthdate", "tax_id",
        "street_address_1", "street_address_2", "country", "city",
        "state_province", "zip_postal_code", "profile_complete"
    ]

    updates = {k: v for k, v in data.items() if k in allowed_fields}
    if not updates and "roles" not in data:
        return jsonify({"error": "No valid fields to update"}), 400

    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        if updates:
            set_clause = ", ".join([f"{k} = %s" for k in updates.keys()])
            set_clause += ", updated_at = NOW()"
            values = list(updates.values()) + [user_id]
            cur.execute(f"UPDATE users SET {set_clause} WHERE id = %s RETURNING *", values)
            user = cur.fetchone()
            if not user:
                return jsonify({"error": "User not found"}), 404

        if "roles" in data:
            cur.execute("DELETE FROM user_roles WHERE user_id = %s", (user_id,))
            for role_name in data["roles"]:
                cur.execute("""
                    INSERT INTO user_roles (user_id, role_id)
                    SELECT %s, id FROM roles WHERE name = %s
                    ON CONFLICT DO NOTHING
                """, (user_id, role_name))

        conn.commit()

        cur.execute("""
            SELECT u.*, 
                COALESCE(
                    json_agg(json_build_object('id', r.id, 'name', r.name, 'description', r.description))
                    FILTER (WHERE r.id IS NOT NULL), '[]'
                ) as roles
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.id
            WHERE u.id = %s
            GROUP BY u.id
        """, (user_id,))
        user = cur.fetchone()
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        return jsonify({"error": "A user with this email already exists"}), 409
    finally:
        cur.close()
        conn.close()

    if user.get("birthdate"):
        user["birthdate"] = user["birthdate"].isoformat()
    if user.get("created_at"):
        user["created_at"] = user["created_at"].isoformat()
    if user.get("updated_at"):
        user["updated_at"] = user["updated_at"].isoformat()
    return jsonify(user)


@app.route("/api/users/<int:user_id>", methods=["DELETE"])
def delete_user(user_id):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM users WHERE id = %s RETURNING id", (user_id,))
    deleted = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if not deleted:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"message": "User deleted successfully"})


@app.route("/api/roles", methods=["GET"])
def get_roles():
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM roles ORDER BY id")
    roles = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify(roles)


if __name__ == "__main__":
    port = int(os.environ.get("FLASK_PORT", "8000"))
    app.run(host="0.0.0.0", port=port, debug=True)
