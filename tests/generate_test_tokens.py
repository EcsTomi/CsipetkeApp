from datetime import datetime, timedelta, timezone

import jwt
import json
import time


JWT_SECRET_KEY = ""
ALGORITHM = "HS256"

tokens = []
for i in range(40, 651):
    class_letter = ["a", "b", "c", "d"][i % 4]
    payload = {
        "id": i,
        "sub": "user" + str(i) + "@example.com",
        "name": f"Test user {i}",
        "role_code": "organizer" if i <= 30 else "contestant" if i <= 150 else "student",
        "class": class_letter,
        "year": 24,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=120),  # 2 órás érvényesség a teszt idejére
    }
    tokens.append(jwt.encode(payload, JWT_SECRET_KEY, algorithm=ALGORITHM))

with open("test_tokens.json", "w") as f:
    json.dump(tokens, f)