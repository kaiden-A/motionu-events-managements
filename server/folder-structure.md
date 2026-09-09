
## standard folder structure design
## must use uv
## main directory need to be app/ just like shown

fastapi-practice/
├── alembic/                     # Migration files
│   ├── env.py                   # Alembic config (reads .env + models)
│   ├── script.py.mako           # Migration template
│   └── versions/                # Generated migrations
│       ├── bc51253100d0_initial_migration.py
│       └── 355a22212c21_add_added_by_column_in_products.py
├── app/
│   ├── main.py                  # FastAPI app entry point
│   ├── config.py                # Pydantic Settings (reads .env)
│   ├── database.py              # SQLAlchemy engine + session + Base
│   ├── dependencies.py          # Auth dependency (JWT decode)
│   ├── models/
│   │   ├── users.py             # User ORM model
│   │   └── products.py          # Product ORM model
│   ├── schemas/
│   │   ├── users.py             # Pydantic models (Create, Login, Update)
│   │   └── products.py          # Pydantic models (Create, Base)
│   ├── routers/
│   │   ├── auth_router.py       # POST /signup, POST /login
│   │   └── products_router.py   # CRUD for products
│   └── services/
│       ├── auth_services.py     # Auth business logic
│       └── products_services.py # Product business logic
├── pyproject.toml               # Project config + dependencies
├── alembic.ini                  # Alembic config template
└── .gitignore