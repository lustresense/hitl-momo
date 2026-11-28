"""Music generators. Import every public module in this package so its @music/@stinger/@ambience decorators register.
Modules whose name starts with an underscore (e.g. _check.py, a QA script) are not imported."""
import importlib
import pkgutil

for _m in pkgutil.iter_modules(__path__):
    if not _m.name.startswith("_"):
        importlib.import_module(f"{__name__}.{_m.name}")
