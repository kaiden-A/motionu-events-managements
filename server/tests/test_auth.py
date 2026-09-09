from app.dependencies import UserPrincipal, _extract_roles


def test_extract_roles_project_claim():
    claims = {
        "urn:zitadel:iam:org:project:roles": {
            "member": {"1": {"name": "Member"}},
            "admin": {"2": {"name": "Admin"}},
        }
    }
    assert _extract_roles(claims) == ["admin", "member"]


def test_extract_roles_org_claim():
    claims = {"urn:zitadel:iam:org:roles": {"editor": {"1": {}}}}
    assert _extract_roles(claims) == ["editor"]


def test_extract_roles_both_claims_merged():
    claims = {
        "urn:zitadel:iam:org:project:roles": {"member": {"1": {}}},
        "urn:zitadel:iam:org:roles": {"admin": {"1": {}}},
    }
    assert _extract_roles(claims) == ["admin", "member"]


def test_extract_roles_empty_mapping_ignored():
    claims = {"urn:zitadel:iam:org:project:roles": {"member": {}}}
    assert _extract_roles(claims) == []


def test_extract_roles_missing_claims():
    assert _extract_roles({"sub": "x"}) == []


def test_extract_roles_sorted_dedup():
    claims = {"urn:zitadel:iam:org:roles": {"admin": {"1": {}}, "admin": {"2": {}}}}
    assert _extract_roles(claims) == ["admin"]


def test_is_admin_true():
    assert UserPrincipal(sub="1", roles=["member", "admin"]).is_admin


def test_is_admin_false():
    assert not UserPrincipal(sub="1", roles=["member"]).is_admin


def test_is_admin_no_roles():
    assert not UserPrincipal(sub="1", roles=[]).is_admin
