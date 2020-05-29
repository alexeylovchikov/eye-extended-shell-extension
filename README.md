## Eye Extended Extension

![](img/vpn.png) 

This is Fork at https://extensions.gnome.org/extension/213/eye/

The extension adds an eye to the indicator bar that follows your cursor.

Documentation for anyone stumbling across this repo:

* http://smasue.github.io/gnome-shell-tw

## Installation

1. `git clone https://github.com/alexeylovchikov/eye-extended-shell-extension.git`
2. `./install.sh`

3. Then you'll want to activate the plugin either by using the Gnome Tweak Tool or by execing `gnome-shell-extension-prefs` and using that UI.

---

## Commands

Compile shemas
glib-compile-schemas ./schemas

Generate pot language file
xgettext --output=locale/ru/LC_MESSAGES/EyeExtended.pot *.js
msgmerge ./locale/ru/LC_MESSAGES/EyeExtended_copy.pot ./locale/ru/LC_MESSAGES/EyeExtended.po -o ./locale/ru/LC_MESSAGES/EyeExtended.po
msgfmt -o ./locale/ru/LC_MESSAGES/EyeExtended.mo ./locale/ru/LC_MESSAGES/EyeExtended.po
