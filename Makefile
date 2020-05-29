.PHONY:
.DEFAULT_GOAL := help

define PRINT_HELP_PYSCRIPT
import re, sys
print("\x1b[1m%-20s\x1b[0m%s" % ("Использовать:", "make [КОММАНДА]"))
print("\x1b[1m%-20s %s\x1b[0m" % ("КОММАНДА", "ОПИСАНИЕ"))
for line in sys.stdin:
	match = re.match(r'^([a-zA-Z_-]+):.*?## (.*)$$', line)
	if match:
		target, help = match.groups()
		print("\x1b[92m%-13s\x1b[0m%s" % (target, help))
endef
export PRINT_HELP_PYSCRIPT

help:
	@python -c "$$PRINT_HELP_PYSCRIPT" < $(MAKEFILE_LIST)

debug_log: ## Debug log
	@journalctl -f -o cat /usr/bin/gnome-shell

build: ## Build schemas and languages
	@glib-compile-schemas schemas/

# lg - Extansion lg manager, run ALT+F2