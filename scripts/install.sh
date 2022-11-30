#!/bin/bash

echo "Packing the extension..."
rm ../eye-extended@als.kz.shell-extension.zip -v
gnome-extensions pack ../eye-extended@als.kz \
    --podir="../translations" \
    --extra-source="circle" \
    --out-dir="../"

echo "Uninstalling old extension..."
gnome-extensions uninstall eye-extended@als.kz
rm -rfv ~/.local/share/gnome-shell/extensions/eye-extended@als.kz

echo "Installing the extension..."
gnome-extensions install ../eye-extended@als.kz.shell-extension.zip

echo "Cleaning up..."
#rm ../eye-extended@als.kz.shell-extension.zip

echo "Done! Now restart your session."
