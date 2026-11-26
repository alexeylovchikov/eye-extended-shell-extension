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

const KOFI_URL = 'https://ko-fi.com/alexeylovchikov';

// Adds the explanation shown under the title of a settings row
function describe(row, subtitle) {
    row.subtitle = subtitle;
    return row;
}

export default class EyeExtendedPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        // Keep settings alive as long as the window
        window._settings = settings;

        window.add(this._eyePage(settings, window));
        window.add(this._mouseCirclePage(settings, window));
        window.add(this._trailPage(settings, window));
    }

    // Bottom of every page: a button that resets all settings
    // and a link to support the project
    _resetGroup(settings, window) {
        const group = new Adw.PreferencesGroup();
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
        });
        const button = new Gtk.Button({
            label: _('Reset to defaults'),
            halign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });
        button.connect('clicked', () => this._confirmReset(settings, window));
        box.append(button);
        box.append(new Gtk.LinkButton({
            label: _('Support the project on Ko-fi'),
            uri: KOFI_URL,
            halign: Gtk.Align.CENTER,
        }));
        group.add(box);
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
            ['cat', _('Cat eye')],
            ['pair', _('Pair of eyes')],
            ['cartoon', _('Cartoon')],
            ['robot', _('Lens')],
            ['crosshair', _('Crosshair')],
        ]));
        group.add(describe(this._comboRow(settings, 'eye-position', _('Place in the panel'), [
            ['left', _('Left')],
            ['center', _('Center')],
            ['right', _('Right')],
        ]), _('Part of the top panel the eye is shown in')));
        group.add(describe(
            this._spinRow(settings, 'eye-position-weight', _('Order in the panel'), -255, 255, 1),
            _('Order among the other icons in the same part of the panel')));
        group.add(describe(
            this._spinRow(settings, 'eye-size', _('Size'), 8, 64, 1),
            _('Eye height in pixels')));
        group.add(describe(
            this._spinRow(settings, 'eye-line-width', _('Line thickness'), 0, 5, 0.1, 1),
            _('Width of the eye outline')));
        group.add(describe(
            this._spinRow(settings, 'eye-margin', _('Margin'), 0, 5, 0.1, 1),
            _('Empty space on both sides of the eye')));
        group.add(describe(
            this._spinRow(settings, 'eye-repaint-interval', _('Refresh interval (ms)'), 1, 1000, 10),
            _('Lower is smoother, higher uses less CPU')));

        const behaviorGroup = new Adw.PreferencesGroup({
            title: _('Behavior'),
            description: _('What the eye does besides following the cursor'),
        });
        page.add(behaviorGroup);

        behaviorGroup.add(describe(
            this._switchRow(settings, 'eye-blink', _('Blink')),
            _('The eye blinks from time to time')));
        behaviorGroup.add(describe(
            this._switchRow(settings, 'eye-blink-on-click', _('Blink on click')),
            _('The eye blinks when a mouse button is pressed')));
        behaviorGroup.add(describe(
            this._switchRow(settings, 'eye-pupil-distance', _('Pupil reacts to the cursor')),
            _('The pupil grows as the cursor comes closer to the eye')));
        behaviorGroup.add(describe(
            this._switchRow(settings, 'eye-sleepy', _('Fall asleep')),
            _('The eye half closes when the mouse has not moved for 30 seconds')));

        page.add(this._resetGroup(settings, window));

        return page;
    }

    _mouseCirclePage(settings, window) {
        const page = new Adw.PreferencesPage({
            title: _('Mouse indicator'),
            icon_name: 'input-mouse-symbolic',
        });
        const group = new Adw.PreferencesGroup({
            description: _('Turn it on from the menu of the eye'),
        });
        page.add(group);

        group.add(describe(
            this._switchRow(settings, 'mouse-circle-enable', _('Show the shape around the cursor')),
            _('When it is off, only clicks are highlighted')));
        group.add(describe(
            this._spinRow(settings, 'mouse-circle-mode', _('Shape'), 1, 19, 1),
            _('One of the 19 shapes')));
        group.add(describe(
            this._spinRow(settings, 'mouse-circle-size', _('Size'), 1, 500, 10),
            _('Shape size in pixels')));
        group.add(describe(
            this._spinRow(settings, 'mouse-circle-opacity', _('Opacity'), 1, 255, 10),
            _('From 1 (almost invisible) to 255 (opaque)')));
        group.add(describe(
            this._spinRow(settings, 'mouse-circle-repaint-interval', _('Refresh interval (ms)'), 1, 1000, 10),
            _('Lower is smoother, higher uses less CPU')));
        group.add(describe(
            this._colorRow(settings, 'mouse-circle-color', _('Color')),
            _('Shape color when no button is pressed')));
        group.add(describe(
            this._switchRow(settings, 'mouse-circle-color-eye', _('Color the eye')),
            _('The eye in the panel takes the color of the indicator while it is on')));

        const clickGroup = new Adw.PreferencesGroup({
            title: _('Clicks'),
            description: _('The shape changes color and flashes on click'),
        });
        page.add(clickGroup);

        clickGroup.add(this._switchRow(settings, 'mouse-circle-left-click-enable', _('Highlight left clicks')));
        clickGroup.add(this._switchRow(settings, 'mouse-circle-middle-click-enable', _('Highlight middle clicks')));
        clickGroup.add(this._switchRow(settings, 'mouse-circle-right-click-enable', _('Highlight right clicks')));

        // The click colors share a row, in the order of the mouse buttons
        const clickRow = new Adw.ActionRow({
            title: _('Click colors'),
            subtitle: _('Left, middle, right'),
        });
        for (const [key, tooltip] of [
            ['mouse-circle-left-click-color', _('Left click')],
            ['mouse-circle-middle-click-color', _('Middle click')],
            ['mouse-circle-right-click-color', _('Right click')],
        ]) {
            const button = this._colorButton(settings, key);
            button.tooltip_text = tooltip;
            clickRow.add_suffix(button);
        }
        clickGroup.add(clickRow);

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

        trailGroup.add(describe(
            this._switchRow(settings, 'water-ripple-enable', _('Enable')),
            _('The same switch is in the menu of the eye')));
        trailGroup.add(describe(this._comboRow(settings, 'water-ripple-trigger', _('Show'), [
            ['ctrl', _('While Ctrl is held')],
            ['always', _('Always')],
        ]), _('When the trail is drawn as the mouse moves')));
        trailGroup.add(this._comboRow(settings, 'water-ripple-effect', _('Animation'), [
            ['ripples', _('Water ripples')],
            ['line', _('Pointer line')],
            ['comet', _('Comet tail')],
            ['sparkles', _('Sparkles')],
        ]));
        const shapeRow = describe(
            this._spinRow(settings, 'water-ripple-mode', _('Shape'), 0, 19, 1),
            _('0 is a plain ring or dot, 1–19 are the mouse indicator shapes'));
        trailGroup.add(shapeRow);
        trailGroup.add(describe(
            this._spinRow(settings, 'water-ripple-size', _('Size'), 1, 500, 10),
            _('Size of each piece of the trail in pixels')));
        trailGroup.add(describe(
            this._spinRow(settings, 'water-ripple-line-width', _('Line thickness'), 1, 30, 1, 1),
            _('Width of the ring outline and of the pointer line')));
        trailGroup.add(describe(
            this._spinRow(settings, 'water-ripple-duration', _('Duration (ms)'), 100, 5000, 100),
            _('How long the trail takes to fade away')));
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
        const button = this._colorButton(settings, key);
        const row = new Adw.ActionRow({title, activatable_widget: button});
        row.add_suffix(button);
        return row;
    }

    _colorButton(settings, key) {
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

        return button;
    }
}
