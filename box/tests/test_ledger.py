import sqlite3

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from coupured.ledger import GENESIS, Ledger

payloads = st.dictionaries(
    st.text(min_size=1, max_size=8),
    st.one_of(st.integers(-(10**12), 10**12), st.text(max_size=20), st.booleans(), st.none()),
    max_size=4,
)


def test_chain_links_and_verifies(tmp_path):
    lg = Ledger(str(tmp_path / "l.sqlite"))
    a = lg.append("boot", {"x": 1})
    b = lg.append("island", {"to": "ISLAND"})
    assert a.prev_hash == GENESIS and b.prev_hash == a.hash
    assert lg.verify() == {"ok": True, "length": 2, "head": b.hash, "first_bad_seq": None}


def test_storage_layer_refuses_update_and_delete(tmp_path):
    lg = Ledger(str(tmp_path / "l.sqlite"))
    lg.append("boot", {})
    with pytest.raises(sqlite3.IntegrityError):
        lg._db.execute("UPDATE ledger SET kind='x'")
    with pytest.raises(sqlite3.IntegrityError):
        lg._db.execute("DELETE FROM ledger")


@settings(max_examples=60, deadline=None)
@given(
    st.lists(st.tuples(st.sampled_from(["boot", "island", "receipt"]), payloads), min_size=2, max_size=12), st.data()
)
def test_any_tamper_is_detected(tmp_path_factory, events, data):
    path = tmp_path_factory.mktemp("l") / "l.sqlite"
    lg = Ledger(str(path))
    for kind, p in events:
        lg.append(kind, p)
    assert lg.verify()["ok"]
    victim = data.draw(st.integers(1, len(events)))
    # tamper underneath the triggers, as an attacker with file access would
    lg._db.execute("DROP TRIGGER ledger_no_update")
    lg._db.execute("UPDATE ledger SET payload=? WHERE seq=?", ('{"tampered":true}', victim))
    res = lg.verify()
    assert not res["ok"] and res["first_bad_seq"] == victim
