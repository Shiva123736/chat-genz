import os
import re
import uuid
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager, create_access_token, get_jwt_identity, jwt_required
)
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import or_, and_
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from PIL import Image, UnidentifiedImageError

load_dotenv()
BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = Path(os.getenv("UPLOAD_FOLDER", "uploads"))
if not UPLOAD_DIR.is_absolute():
    UPLOAD_DIR = BASE_DIR / UPLOAD_DIR
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://chatgenz_user:change_this_password@127.0.0.1:3306/chat_genz"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "dev-only-change-this-secret")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=12)
app.config["MAX_CONTENT_LENGTH"] = int(os.getenv("MAX_CONTENT_LENGTH", "5242880"))
app.config["UPLOAD_FOLDER"] = str(UPLOAD_DIR)

origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "*").split(",") if x.strip()]
CORS(app, resources={r"/api/*": {"origins": origins or "*"}})
db = SQLAlchemy(app)
jwt = JWTManager(app)
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}

class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.BigInteger, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    username = db.Column(db.String(30), unique=True, nullable=False)
    email = db.Column(db.String(254), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    bio = db.Column(db.String(280), nullable=False, default="")
    avatar_url = db.Column(db.String(500))
    created_at = db.Column(db.DateTime, server_default=db.func.current_timestamp())

    def public(self):
        return {"id": self.id, "name": self.name, "username": self.username,
                "bio": self.bio or "", "avatar_url": self.avatar_url,
                "created_at": self.created_at.isoformat() if self.created_at else None}

class Post(db.Model):
    __tablename__ = "posts"
    id = db.Column(db.BigInteger, primary_key=True)
    user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    image_url = db.Column(db.String(500), nullable=False)
    caption = db.Column(db.String(2200), nullable=False, default="")
    created_at = db.Column(db.DateTime, server_default=db.func.current_timestamp())
    user = db.relationship("User")

    def public(self):
        return {"id": self.id, "image_url": self.image_url, "caption": self.caption or "",
                "created_at": self.created_at.isoformat() if self.created_at else None,
                "user": self.user.public()}

class Message(db.Model):
    __tablename__ = "messages"
    id = db.Column(db.BigInteger, primary_key=True)
    sender_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    recipient_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    body = db.Column(db.String(4000), nullable=False)
    created_at = db.Column(db.DateTime, server_default=db.func.current_timestamp())
    sender = db.relationship("User", foreign_keys=[sender_id])
    recipient = db.relationship("User", foreign_keys=[recipient_id])

    def public(self):
        return {"id": self.id, "sender": self.sender.username,
                "recipient": self.recipient.username, "body": self.body,
                "created_at": self.created_at.isoformat() if self.created_at else None}

def error(message, status=400):
    return jsonify({"error": message}), status

def current_user():
    identity = get_jwt_identity()
    try:
        return db.session.get(User, int(identity))
    except (ValueError, TypeError):
        return None

@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "CHAT GENZ API"})

@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    username = str(data.get("username", "")).strip().lower()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    if not name or len(name) > 100:
        return error("Enter your name (maximum 100 characters).")
    if not re.fullmatch(r"[a-z0-9_.]{3,30}", username):
        return error("Username must be 3–30 characters: letters, numbers, underscore or dot.")
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or len(email) > 254:
        return error("Enter a valid email address.")
    if len(password) < 8:
        return error("Password must be at least 8 characters.")
    if User.query.filter(or_(User.username == username, User.email == email)).first():
        return error("Username or email is already registered.", 409)

    user = User(name=name, username=username, email=email,
                password_hash=generate_password_hash(password))
    db.session.add(user)
    db.session.commit()
    token = create_access_token(identity=str(user.id))
    return jsonify({"message": "Account created.", "token": token, "user": user.public()}), 201

@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    identifier = str(data.get("identifier", "")).strip().lower()
    password = str(data.get("password", ""))
    user = User.query.filter(or_(User.username == identifier, User.email == identifier)).first()
    if not user or not check_password_hash(user.password_hash, password):
        return error("Incorrect username/email or password.", 401)
    token = create_access_token(identity=str(user.id))
    return jsonify({"message": "Signed in.", "token": token, "user": user.public()})

@app.get("/api/me")
@jwt_required()
def me():
    user = current_user()
    if not user:
        return error("Account not found.", 404)
    return jsonify({"user": user.public(), "email": user.email})

@app.patch("/api/me")
@jwt_required()
def update_me():
    user = current_user()
    if not user:
        return error("Account not found.", 404)
    data = request.get_json(silent=True) or {}
    if "name" in data:
        name = str(data["name"]).strip()
        if not name or len(name) > 100:
            return error("Name must be 1–100 characters.")
        user.name = name
    if "bio" in data:
        bio = str(data["bio"]).strip()
        if len(bio) > 280:
            return error("Bio must be 280 characters or fewer.")
        user.bio = bio
    db.session.commit()
    return jsonify({"user": user.public()})

@app.get("/api/users/search")
def search_users():
    q = str(request.args.get("q", "")).strip()
    if not q:
        return jsonify({"users": []})
    if len(q) > 80:
        return error("Search query is too long.")
    users = User.query.filter(or_(User.username.like(f"%{q}%"),
                                  User.name.like(f"%{q}%"))).order_by(User.username).limit(30).all()
    return jsonify({"users": [u.public() for u in users]})

@app.get("/api/users/<username>")
def get_user(username):
    user = User.query.filter_by(username=username.lower()).first()
    if not user:
        return error("User not found.", 404)
    return jsonify({"user": user.public()})

@app.post("/api/posts")
@jwt_required()
def create_post():
    user = current_user()
    if not user:
        return error("Account not found.", 404)
    upload = request.files.get("image")
    caption = str(request.form.get("caption", "")).strip()
    if not upload or not upload.filename:
        return error("Choose an image to upload.")
    if len(caption) > 2200:
        return error("Caption is too long.")
    filename = secure_filename(upload.filename)
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        return error("Use PNG, JPG, JPEG, or WEBP images.")
    new_name = f"{uuid.uuid4().hex}.{ext}"
    path = UPLOAD_DIR / new_name
    try:
        upload.stream.seek(0)
        image = Image.open(upload.stream)
        image.verify()
        upload.stream.seek(0)
        image = Image.open(upload.stream)
        if image.width > 8000 or image.height > 8000:
            return error("Image dimensions are too large.")
        upload.save(path)
    except (UnidentifiedImageError, OSError, ValueError):
        return error("That file is not a valid image.")
    post = Post(user_id=user.id, image_url=f"/uploads/{new_name}", caption=caption)
    db.session.add(post)
    db.session.commit()
    return jsonify({"post": post.public()}), 201

@app.get("/api/posts")
def list_posts():
    posts = Post.query.order_by(Post.created_at.desc(), Post.id.desc()).limit(50).all()
    return jsonify({"posts": [p.public() for p in posts]})

@app.get("/api/posts/user/<username>")
def user_posts(username):
    user = User.query.filter_by(username=username.lower()).first()
    if not user:
        return error("User not found.", 404)
    posts = Post.query.filter_by(user_id=user.id).order_by(Post.created_at.desc()).limit(50).all()
    return jsonify({"posts": [p.public() for p in posts]})

@app.post("/api/messages")
@jwt_required()
def send_message():
    sender = current_user()
    if not sender:
        return error("Account not found.", 404)
    data = request.get_json(silent=True) or {}
    recipient_name = str(data.get("recipient_username", "")).strip().lower()
    body = str(data.get("body", "")).strip()
    if not body or len(body) > 4000:
        return error("Message must be 1–4000 characters.")
    recipient = User.query.filter_by(username=recipient_name).first()
    if not recipient:
        return error("Recipient not found.", 404)
    if recipient.id == sender.id:
        return error("You cannot message yourself.")
    msg = Message(sender_id=sender.id, recipient_id=recipient.id, body=body)
    db.session.add(msg)
    db.session.commit()
    return jsonify({"message": msg.public()}), 201

@app.get("/api/messages/<username>")
@jwt_required()
def get_conversation(username):
    me_user = current_user()
    other = User.query.filter_by(username=username.lower()).first()
    if not me_user:
        return error("Account not found.", 404)
    if not other:
        return error("Recipient not found.", 404)
    messages = Message.query.filter(
        or_(and_(Message.sender_id == me_user.id, Message.recipient_id == other.id),
            and_(Message.sender_id == other.id, Message.recipient_id == me_user.id))
    ).order_by(Message.created_at.asc(), Message.id.asc()).limit(200).all()
    return jsonify({"messages": [m.public() for m in messages]})

@app.get("/uploads/<path:filename>")
def uploaded_file(filename):
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename, as_attachment=False)

@app.errorhandler(413)
def too_large(_):
    return error("Upload too large. Maximum file size is 5 MB.", 413)

@app.errorhandler(404)
def not_found(_):
    if request.path.startswith("/api/"):
        return error("Endpoint not found.", 404)
    return jsonify({"error": "Not found"}), 404

@app.errorhandler(500)
def server_error(_):
    db.session.rollback()
    app.logger.exception("Unexpected server error")
    return error("Unexpected server error. Check the backend terminal logs.", 500)

if __name__ == "__main__":
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=debug)
