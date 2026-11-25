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

        window.add(this._eyePage(settings));
        window.add(this._mouseCirclePage(settings));
        window.add(this._colorPage(settings));
    }

    _eyePage(settings) {
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

        return page;
    }

    _mouseCirclePage(settings) {
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

        return page;
    }

    _colorPage(settings) {
        const page = new Adw.PreferencesPage({
            title: _('Color'),
            icon_name: 'applications-graphics-symbolic',
        });
        const group = new Adw.PreferencesGroup();
        page.add(group);

        group.add(this._colorRow(settings, 'mouse-circle-color', _('Default')));
        group.add(this._colorRow(settings, 'mouse-circle-left-click-color', _('Left click')));
        group.add(this._colorRow(settings, 'mouse-circle-right-click-color', _('Right click')));
        group.add(this._colorRow(settings, 'mouse-circle-middle-click-color', _('Middle click')));

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
            const value = button.rgba.to_string();
            if (value !== settings.get_string(key))
                settings.set_string(key, value);
        });

        const row = new Adw.ActionRow({title, activatable_widget: button});
        row.add_suffix(button);
        return row;
    }
}
