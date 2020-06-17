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
	@journalctl -f -o cat /usr/bin/gnome-shell | grep eye:

schemas_build: ## Build schemas
	@glib-compile-schemas eye-extended@als.kz/schemas/

locale_build: ## Build locale
	@msgfmt eye-extended@als.kz/locale/ru/LC_MESSAGES/EyeExtended.po -o eye-extended@als.kz/locale/ru/LC_MESSAGES/EyeExtended.mo &&\
	msgfmt eye-extended@als.kz/locale/en/LC_MESSAGES/EyeExtended.po -o eye-extended@als.kz/locale/en/LC_MESSAGES/EyeExtended.mo &&\
	msgfmt eye-extended@als.kz/locale/de/LC_MESSAGES/EyeExtended.po -o eye-extended@als.kz/locale/de/LC_MESSAGES/EyeExtended.mo

locale_update: ## Update locale
	@xgettext --no-location -o eye-extended@als.kz/locale/EyeExtended.pot eye-extended@als.kz/*.js &&\
	msgmerge --no-location --previous --silent --lang=ru eye-extended@als.kz/locale/ru/LC_MESSAGES/EyeExtended.po eye-extended@als.kz/locale/EyeExtended.pot -o eye-extended@als.kz/locale/ru/LC_MESSAGES/EyeExtended.po &&\
	msgmerge --no-location --previous --silent --lang=en eye-extended@als.kz/locale/en/LC_MESSAGES/EyeExtended.po eye-extended@als.kz/locale/EyeExtended.pot -o eye-extended@als.kz/locale/en/LC_MESSAGES/EyeExtended.po &&\
	msgmerge --no-location --previous --silent --lang=de eye-extended@als.kz/locale/de/LC_MESSAGES/EyeExtended.po eye-extended@als.kz/locale/EyeExtended.pot -o eye-extended@als.kz/locale/de/LC_MESSAGES/EyeExtended.po

locale_create: ## Create new locale
	@read -p "Enter locale: " vlocale; \
	mkdir -p eye-extended@als.kz/locale/$$veye-extended@als.kz/locale/LC_MESSAGES/ &&\
	xgettext --no-location -o eye-extended@als.kz/locale/EyeExtended.pot *.js &&\
	msginit -l $$vlocale -i eye-extended@als.kz/locale/EyeExtended.pot -o eye-extended@als.kz/locale/$$veye-extended@als.kz/locale/LC_MESSAGES/EyeExtended.po

install: ## Install extansion
	@rm -rf ~/.local/share/gnome-shell/extensions/eye-extended@als.kz &&\
	cp -R eye-extended@als.kz/ ~/.local/share/gnome-shell/extensions

# lg - Extansion lg manager, run ALT+F2