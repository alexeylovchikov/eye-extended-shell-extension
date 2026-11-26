/* prefs.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class EyeExtendedPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        // Keep settings alive as long as the window
        window._settings = settings;

        window.add(this._eyePage(settings, window));
        window.add(this._mouseCirclePage(settings, window));
        window.add(this._trailPage(settings, window));
    }

    // Button at the bottom of every page that resets all settings
    _resetGroup(settings, window) {
        const group = new Adw.PreferencesGroup();
        const button = new Gtk.Button({
            label: _('Reset to defaults'),
            halign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });
        button.connect('clicked', () => this._confirmReset(settings, window));
        group.add(button);
        return group;
    }

    _confirmReset(settings, window) {
        const heading = _('Reset all settings?');
        const body = _('All settings of the extension will be returned to their default values.');
        // Adw.AlertDialog needs libadwaita 1.5 (GNOME 46)
        const dialog = Adw.AlertDialog
            ? new Adw.AlertDialog({heading, body})
            : new Adw.MessageDialog({heading, body, transient_for: window, modal: true});

        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('reset', _('Reset'));
        dialog.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');
        dialog.connect('response', (d, response) => {
            if (response !== 'reset')
                return;
            for (const key of settings.settings_schema.list_keys())
                settings.reset(key);
        });

        if (Adw.AlertDialog)
            dialog.present(window);
        else
            dialog.present();
    }

    _eyePage(settings, window) {
        const page = new Adw.PreferencesPage({
            title: _('Eye'),
            icon_name: 'view-reveal-symbolic',
        });
        const group = new Adw.PreferencesGroup();
        page.add(group);

        group.add(this._comboRow(settings, 'eye-mode', _('Shape'), [
            ['bulb', _('Round')],
            ['lids', _('Eyelid')],
        ]));
        group.add(this._comboRow(settings, 'eye-position', _('Location'), [
            ['left', _('Left')],
            ['center', _('Center')],
            ['right', _('Right')],
        ]));
        group.add(this._spinRow(settings, 'eye-position-weight', _('Position'), -255, 255, 1));
        group.add(this._spinRow(settings, 'eye-size', _('Size'), 8, 64, 1));
        group.add(this._spinRow(settings, 'eye-line-width', _('Line Thickness'), 0, 5, 0.1, 1));
        group.add(this._spinRow(settings, 'eye-margin', _('Margin'), 0, 5, 0.1, 1));
        group.add(this._spinRow(settings, 'eye-repaint-interval', _('Refresh interval (ms)'), 1, 1000, 10));

        page.add(this._resetGroup(settings, window));

        return page;
    }

    _mouseCirclePage(settings, window) {
        const page = new Adw.PreferencesPage({
            title: _('Mouse indicator'),
            icon_name: 'input-mouse-symbolic',
        });
        const group = new Adw.PreferencesGroup({
            description: _('Click on the eye to turn it on'),
        });
        page.add(group);

        group.add(this._switchRow(settings, 'mouse-circle-enable', _('Enable')));
        group.add(this._spinRow(settings, 'mouse-circle-mode', _('Shape'), 1, 19, 1));
        group.add(this._spinRow(settings, 'mouse-circle-size', _('Size'), 1, 500, 10));
        group.add(this._spinRow(settings, 'mouse-circle-opacity', _('Opacity'), 1, 255, 10));
        group.add(this._spinRow(settings, 'mouse-circle-repaint-interval', _('Refresh interval (ms)'), 1, 1000, 10));
        group.add(this._switchRow(settings, 'mouse-circle-left-click-enable', _('Enable left click coloring')));
        group.add(this._switchRow(settings, 'mouse-circle-right-click-enable', _('Enable right click coloring')));
        group.add(this._switchRow(settings, 'mouse-circle-middle-click-enable', _('Enable middle click coloring')));
        group.add(this._colorRow(settings, 'mouse-circle-color', _('Default')));
        group.add(this._colorRow(settings, 'mouse-circle-left-click-color', _('Left click')));
        group.add(this._colorRow(settings, 'mouse-circle-right-click-color', _('Right click')));
        group.add(this._colorRow(settings, 'mouse-circle-middle-click-color', _('Middle click')));

        page.add(this._resetGroup(settings, window));

        return page;
    }

    _trailPage(settings, window) {
        const page = new Adw.PreferencesPage({
            title: _('Pointer trail'),
            icon_name: 'document-edit-symbolic',
        });
        const trailGroup = new Adw.PreferencesGroup({
            description: _('Animation that follows the mouse'),
        });
        page.add(trailGroup);

        trailGroup.add(this._switchRow(settings, 'water-ripple-enable', _('Enable')));
        trailGroup.add(this._comboRow(settings, 'water-ripple-trigger', _('Show'), [
            ['ctrl', _('While Ctrl is held')],
            ['always', _('Always')],
        ]));
        trailGroup.add(this._comboRow(settings, 'water-ripple-effect', _('Animation'), [
            ['ripples', _('Water ripples')],
            ['line', _('Pointer line')],
            ['comet', _('Comet tail')],
            ['sparkles', _('Sparkles')],
        ]));
        const shapeRow = this._spinRow(settings, 'water-ripple-mode', _('Shape'), 0, 19, 1);
        trailGroup.add(shapeRow);
        trailGroup.add(this._spinRow(settings, 'water-ripple-size', _('Size'), 1, 500, 10));
        trailGroup.add(this._spinRow(settings, 'water-ripple-line-width', _('Line Thickness'), 1, 30, 1, 1));
        trailGroup.add(this._spinRow(settings, 'water-ripple-duration', _('Duration (ms)'), 100, 5000, 100));
        trailGroup.add(this._colorRow(settings, 'water-ripple-color', _('Color')));

        // The line effect has no shape
        const syncShape = () => {
            shapeRow.sensitive = settings.get_string('water-ripple-effect') !== 'line';
        };
        syncShape();
        settings.connect('changed::water-ripple-effect', syncShape);

        page.add(this._resetGroup(settings, window));

        return page;
    }

    _comboRow(settings, key, title, items) {
        const row = new Adw.ComboRow({
            title,
            model: Gtk.StringList.new(items.map(item => item[1])),
        });
        const ids = items.map(item => item[0]);

        const sync = () => {
            const index = ids.indexOf(settings.get_string(key));
            row.selected = index >= 0 ? index : 0;
        };
        sync();
        settings.connect(`changed::${key}`, sync);
        row.connect('notify::selected', () => {
            const id = ids[row.selected];
            if (id !== undefined && id !== settings.get_string(key))
                settings.set_string(key, id);
        });

        return row;
    }

    _spinRow(settings, key, title, min, max, step, digits = 0) {
        const row = new Adw.SpinRow({
            title,
            digits,
            adjustment: new Gtk.Adjustment({
                lower: min,
                upper: max,
                step_increment: step,
                page_increment: step * 2,
            }),
        });
        settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _switchRow(settings, key, title) {
        const row = new Adw.SwitchRow({title});
        settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _colorRow(settings, key, title) {
        const button = new Gtk.ColorDialogButton({
            dialog: new Gtk.ColorDialog(),
            valign: Gtk.Align.CENTER,
        });

        const sync = () => {
            const rgba = new Gdk.RGBA();
            if (rgba.parse(settings.get_string(key)) && !rgba.equal(button.rgba))
                button.rgba = rgba;
        };
        sync();
        settings.connect(`changed::${key}`, sync);
        button.connect('notify::rgba', () => {
            // Compare colors, not strings: "#62a0ea" and "rgb(98,160,234)" are
            // the same color and must not overwrite the stored value
            const current = new Gdk.RGBA();
            if (current.parse(settings.get_string(key)) && current.equal(button.rgba))
                return;
            settings.set_string(key, button.rgba.to_string());
        });

        const row = new Adw.ActionRow({title, activatable_widget: button});
        row.add_suffix(button);
        return row;
    }
}
