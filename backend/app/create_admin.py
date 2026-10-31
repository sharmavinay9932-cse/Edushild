import getpass

import mysql.connector
from pydantic import EmailStr, TypeAdapter, ValidationError

from .database import connection, initialize_database
from .security import hash_password


def main() -> None:
    initialize_database()
    email_input = input("Admin email: ").strip().lower()
    try:
        email = str(TypeAdapter(EmailStr).validate_python(email_input))
    except ValidationError as error:
        raise SystemExit("Enter a valid email address.") from error
    display_name = input("Admin display name: ").strip()
    if not display_name:
        raise SystemExit("Admin display name cannot be blank.")
    password = getpass.getpass("Admin password (12+ characters): ")
    if len(password) < 12:
        raise SystemExit("Use a password with at least 12 characters.")
    confirmation = getpass.getpass("Confirm password: ")
    if password != confirmation:
        raise SystemExit("The passwords did not match.")

    try:
        with connection() as conn:
            conn.execute(
                "INSERT INTO users (email, display_name, role, password_hash) "
                "VALUES (%s, %s, 'admin', %s)",
                (email, display_name, hash_password(password)),
            )
    except mysql.connector.IntegrityError as error:
        if error.errno == 1062:
            raise SystemExit("An account already uses that email address.") from error
        raise
    print(f"Administrator account created for {email}.")


if __name__ == "__main__":
    main()
