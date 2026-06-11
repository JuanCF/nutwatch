import pytest


SAMPLE_USERS = """[monuser]
  password = secret
  upsmon = master
"""


def test_list_users(monkeypatch):
    monkeypatch.setattr("services.users.read_file", lambda p: SAMPLE_USERS)
    from services.users import list_users
    users = list_users()
    assert len(users) == 1
    assert users[0]["name"] == "monuser"
    assert users[0]["password"] != "secret"


def test_list_users_not_found(monkeypatch):
    monkeypatch.setattr("services.users.read_file", lambda p: (_ for _ in ()).throw(FileNotFoundError))
    from services.users import list_users
    assert list_users() == []


def test_add_user(monkeypatch):
    ops = {}
    monkeypatch.setattr("services.users.read_file", lambda p: "")
    monkeypatch.setattr("services.users.write_file", lambda p, c: ops.update({p: c}))
    from services.users import add_user
    entry, err = add_user({"name": "newuser", "password": "secret", "upsmon": "slave"})
    assert err is None
    assert entry["name"] == "newuser"


def test_add_user_no_name():
    from services.users import add_user
    entry, err = add_user({})
    assert entry is None
    assert err == "name is required"


def test_add_user_invalid_name():
    from services.users import add_user
    entry, err = add_user({"name": ""})
    assert err == "name is required"


def test_add_user_bad_identifier():
    from services.users import add_user
    entry, err = add_user({"name": "bad name!"})
    assert err == "invalid identifier"


def test_add_user_duplicate(monkeypatch):
    monkeypatch.setattr("services.users.read_file", lambda p: SAMPLE_USERS)
    from services.users import add_user
    entry, err = add_user({"name": "monuser", "password": "x"})
    assert entry is None
    assert err == "user already exists"


def test_add_user_invalid_directive(monkeypatch):
    monkeypatch.setattr("services.users.read_file", lambda p: "")
    from services.users import add_user
    entry, err = add_user({"name": "u", "directives": {"": "val"}})
    assert "invalid directive key" in err


def test_edit_user(monkeypatch):
    monkeypatch.setattr("services.users.read_file", lambda p: SAMPLE_USERS)
    monkeypatch.setattr("services.users.write_file", lambda p, c: None)
    from services.users import edit_user
    e = edit_user("monuser", {"upsmon": "slave"})
    assert e is not None
    assert e["upsmon"] == "slave"


def test_edit_user_not_found(monkeypatch):
    monkeypatch.setattr("services.users.read_file", lambda p: SAMPLE_USERS)
    from services.users import edit_user
    assert edit_user("nobody", {}) is None


def test_edit_user_directives(monkeypatch):
    monkeypatch.setattr("services.users.read_file", lambda p: SAMPLE_USERS)
    monkeypatch.setattr("services.users.write_file", lambda p, c: None)
    from services.users import edit_user
    e = edit_user("monuser", {"directives": {"actions": "SET"}})
    assert e is not None


def test_edit_user_skip_invalid_directive(monkeypatch):
    monkeypatch.setattr("services.users.read_file", lambda p: SAMPLE_USERS)
    monkeypatch.setattr("services.users.write_file", lambda p, c: None)
    from services.users import edit_user
    e = edit_user("monuser", {"directives": {"": "val"}})
    assert e is not None


def test_edit_user_file_not_found(monkeypatch):
    monkeypatch.setattr("services.users.read_file", lambda p: (_ for _ in ()).throw(FileNotFoundError))
    from services.users import edit_user
    assert edit_user("monuser", {}) is None


def test_delete_user(monkeypatch):
    writes = {}
    monkeypatch.setattr("services.users.read_file", lambda p: SAMPLE_USERS)
    monkeypatch.setattr("services.users.write_file", lambda p, c: writes.update({p: c}))
    from services.users import delete_user
    assert delete_user("monuser") is True


def test_delete_user_not_found(monkeypatch):
    monkeypatch.setattr("services.users.read_file", lambda p: SAMPLE_USERS)
    from services.users import delete_user
    assert delete_user("nobody") is False


def test_delete_user_no_file(monkeypatch):
    monkeypatch.setattr("services.users.read_file", lambda p: (_ for _ in ()).throw(FileNotFoundError))
    from services.users import delete_user
    assert delete_user("monuser") is False