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
		print("\x1b[92m%-20s \x1b[0m%s" % (target, help))
endef
export PRINT_HELP_PYSCRIPT

help:
	@python3 -c "$$PRINT_HELP_PYSCRIPT" < $(MAKEFILE_LIST)

debug_log: ## Debug log
	@journalctl -f -o cat /usr/bin/gnome-shell

schemas_build: ## Build schemas
	@glib-compile-schemas schemas/

locale_build: ## Build locale
	@msgfmt locale/ru/LC_MESSAGES/EyeExtended.po -o locale/ru/LC_MESSAGES/EyeExtended.mo &&\
	msgfmt locale/en/LC_MESSAGES/EyeExtended.po -o locale/en/LC_MESSAGES/EyeExtended.mo

locale_update: ## Update locale
	@xgettext --no-location -o locale/EyeExtended.pot *.js &&\
	msgmerge --no-location --previous --silent --lang=ru locale/ru/LC_MESSAGES/EyeExtended.po locale/EyeExtended.pot -o locale/ru/LC_MESSAGES/EyeExtended.po &&\
	msgmerge --no-location --previous --silent --lang=en locale/en/LC_MESSAGES/EyeExtended.po locale/EyeExtended.pot -o locale/en/LC_MESSAGES/EyeExtended.po

locale_create: ## Create new locale
	@read -p "Enter locale: " vlocale; \
	mkdir -p locale/$$vlocale/LC_MESSAGES/ &&\
	xgettext --no-location -o locale/EyeExtended.pot *.js &&\
	msginit -l $$vlocale -i locale/EyeExtended.pot -o locale/$$vlocale/LC_MESSAGES/EyeExtended.po

install: ## Install extansion
	@rm -rf ~/.local/share/gnome-shell/extensions/eye-extended@als.kz &&\
	mkdir -p ~/.local/share/gnome-shell/extensions/eye-extended@als.kz &&\
	cp -R . ~/.local/share/gnome-shell/extensions/eye-extended@als.kz

# lg - Extansion lg manager, run ALT+F2