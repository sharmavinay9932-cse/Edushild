from app.config import MYSQL_DATABASE
from app.database import connection, initialize_database


initialize_database()
with connection() as conn:
    tables = conn.execute(
        "SELECT TABLE_NAME AS name FROM information_schema.TABLES "
        "WHERE TABLE_SCHEMA = %s AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
        (MYSQL_DATABASE,),
    ).fetchall()
    for table in tables:
        name = table["name"]
        print(f"TABLE: {name}")
        columns = conn.execute(
            "SELECT ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, "
            "COLUMN_DEFAULT, COLUMN_KEY FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s ORDER BY ORDINAL_POSITION",
            (MYSQL_DATABASE, name),
        ).fetchall()
        for column in columns:
            print(
                f"  {column['ORDINAL_POSITION']} | {column['COLUMN_NAME']} | "
                f"{column['COLUMN_TYPE']} | nullable={column['IS_NULLABLE']} | "
                f"default={column['COLUMN_DEFAULT']} | key={column['COLUMN_KEY']}"
            )
        count = conn.execute(f"SELECT COUNT(*) AS n FROM `{name}`").fetchone()
        print(f"  => rows: {count['n']}\n")
