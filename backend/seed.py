# seed.py
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from models import Role, Permission, RolePermission
from models.user import User

ROLES = [
    Role(code="admin", name="Adminisztrátor"),
    Role(code="organizer", name="Szervező"),
    Role(code="jury", name="Zsűri"),
    Role(code="contestant", name="NYEKes"),
    Role(code="teacher", name="Tanár"),
    Role(code="student", name="Diák")
]

PERMISSIONS = [
    Permission(code="admin.permission",     name="Jogkezelés",                      category="admin"),
    Permission(code="audit_log.view",       name="LOG",                             category="admin"),
    
    Permission(code="vote.restore",         name="Visszaállítás",                   category="szavazás"),
    Permission(code="vote.vote",            name="Szavazás",                        category="szavazás"),
    Permission(code="vote.hidden",          name="Rejtettek",                       category="szavazás"),
    Permission(code="vote.edit",            name="Szerkesztés",                     category="szavazás"),
    
    Permission(code="point.details",        name="Ponttörténet",                    category="pont"),
    Permission(code="point.summary",        name="Összesítés",                      category="pont"),
    Permission(code="point.create",         name="Egyedi hozzáadás",                category="pont"),
    Permission(code="point.remove",         name="Visszavonás",                     category="pont"),
    Permission(code="point.other_class",    name="Többi osztály ponttörténete",     category="pont"),
    Permission(code="point.hidden",         name="Rejtett pontok",                  category="pont"),
    
    Permission(code="task.restore",         name="Visszaállítás",                   category="feladat"),
    Permission(code="task.edit",            name="Szerkesztés",                     category="feladat"),
    Permission(code="task.hidden",          name="Rejtett feladatok",               category="feladat"),
    Permission(code="task.view",            name="Megtekintés",                     category="feladat"),

    Permission(code="submission.all",       name="Minden feltöltés letöltése",      category="feltöltés"),
    Permission(code="submission.submit",    name="Fájlfeltöltés és visszatöltés",   category="feltöltés"),
    Permission(code="submission.get_self",  name="Saját feltöltés visszatöltése",   category="feltöltés"),
    Permission(code="submission.list_other",name="Az összes osztály állapota",      category="feltöltés"),

    Permission(code="program.manage",       name="Kezelés",                         category="program"),
    Permission(code="program.view_all",     name="Programok megtekintése",          category="program"),
    Permission(code="program.view_description",name="Program leírása megtekintése", category="program"),

    Permission(code="settings.freeze",      name="Szüneteltetés",                   category="beállítások",     description="Pontok szüneteltetése"),
    Permission(code="settings.jury_window", name="Zsűri idejének kezelése",         category="beállítások"),

    Permission(code="jury.score",           name="Zsűri pontozás",                  category="zsűri"),
    Permission(code="point.onsite",         name="Szervezői pontozás",              category="zsűri"),

    Permission(code="costume.score",        name="Jelmez pontozás",                 category="costume"),
    Permission(code="costume.total",        name="Jelmez pontozás összesítés",      category="costume"),
    Permission(code="costume.edit",         name="Jelmez pontozás szerkesztés",     category="costume"),

    Permission(code="archive.view",         name="Archivum megtekintése",           category="archive"),
    Permission(code="archive.upload",       name="Archivum feltöltése",             category="archive"),

]

ROLE_PERMISSIONS = [
    RolePermission(role_code="organizer", permission_code="vote.vote"),
    RolePermission(role_code="organizer", permission_code="vote.hidden"),
    RolePermission(role_code="organizer", permission_code="point.details"),
    RolePermission(role_code="organizer", permission_code="point.summary"),
    RolePermission(role_code="organizer", permission_code="point.other_class"),
    RolePermission(role_code="organizer", permission_code="point.hidden"),
    RolePermission(role_code="organizer", permission_code="task.view"),
    RolePermission(role_code="organizer", permission_code="task.hidden"),
    RolePermission(role_code="organizer", permission_code="submission.all"),
    RolePermission(role_code="organizer", permission_code="program.view_all"),
    RolePermission(role_code="organizer", permission_code="program.view_description"),

    RolePermission(role_code="jury", permission_code="vote.vote"),
    RolePermission(role_code="jury", permission_code="jury.score"),
    RolePermission(role_code="jury", permission_code="archive.view"),
    
    RolePermission(role_code="contestant", permission_code="vote.vote"),
    RolePermission(role_code="contestant", permission_code="task.view"),
    RolePermission(role_code="contestant", permission_code="submission.submit"),
    RolePermission(role_code="contestant", permission_code="submission.get_self"),

    RolePermission(role_code="student", permission_code="vote.vote"),
    RolePermission(role_code="student", permission_code="archive.view"),

    RolePermission(role_code="teacher", permission_code="vote.vote"),
    RolePermission(role_code="teacher", permission_code="archive.view"),
]

DEFAULT_USERS = [
    User(id=0, name="Zsűri", email="", picture="logo_sima.png", class_year=0, class_letter="", role_code="jury"),
]

async def seed_roles(session: AsyncSession):
    hasSeeded = (await session.scalars(select(Role.code))).all()
    if hasSeeded:
        return
            
    for role_data in ROLES:
        result = await session.scalars(select(Role).where(Role.code == role_data.code))
        if not result.first():
            session.add(role_data)

    for permission_data in PERMISSIONS:
        result = await session.scalars(select(Permission).where(Permission.code == permission_data.code))
        if not result.first():
            session.add(permission_data)

    for role_permission_data in ROLE_PERMISSIONS:
        result = await session.scalars(select(RolePermission).where(RolePermission.role_code == role_permission_data.role_code, RolePermission.permission_code == role_permission_data.permission_code))
        if not result.first():
            session.add(role_permission_data)

    for user_data in DEFAULT_USERS:
        result = await session.scalars(select(User).where(User.id == user_data.id))
        if not result.first():
            session.add(user_data)
    await session.commit()