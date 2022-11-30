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
'use strict';

// Import required libraries
const { GObject, Gdk, Gio, Gtk } = imports.gi;// graphic objects libraries
const ExtensionUtils = imports.misc.extensionUtils;// access to settings from schema
const Me = ExtensionUtils.getCurrentExtension();
const Domain = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Domain.gettext;// tool to get translations

function init() {
    ExtensionUtils.initTranslations();
}

// Class to create options and labels in the settings menu
const EyeExtendedSettings = new GObject.Class({
    Name: 'EyeExtendedSettings',
    Extends: Gtk.Grid,

    _init: function(params) {
        this.parent(params);

        // Spacing values
        this.vexpand = true;
        this.margin_top = 12;
        this.margin_bottom = 8;
        this.row_spacing = 8;

        this.row_pos = -1;// row position on a page
        this._settings = ExtensionUtils.getSettings();// connect to settings
    },

    _createLabel(text, style=[], col=0, next_row=false) {
        let label = new Gtk.Label({
            hexpand: true,
            halign: Gtk.Align.START,
            wrap: true,
            margin_start: 16
        });
        if (style.length > 0) {
            style.forEach(element => text = "<" + element + ">" + text + "</" + element + ">");
            label.set_markup(text);
        } else {
            label.set_text(text);
        }
        if (next_row) {this.row_pos += 1;}
        this.attach(label, col, this.row_pos, 1, 1);
    },

    _createColor(property_name, col=0, next_row=false) {
        let gdk_color = null;
        let widget = new Gtk.ColorButton({
            halign: Gtk.Align.END,
            margin_end: 16
        });
        gdk_color = new Gdk.RGBA();
        if (gdk_color.parse(this._settings.get_string(property_name))) {
            widget.set_rgba(gdk_color);
        }
        widget.connect('color-set', w => {
            this._settings.set_string(property_name, w.get_rgba().to_string());
        });
        if (next_row) {this.row_pos += 1;}
        this.attach(widget, col, this.row_pos, 1, 1);
    },

    _createList(property_name, list, col=0, next_row=false) {
        let widget = new Gtk.ComboBoxText({
            halign: Gtk.Align.END,
            margin_end: 16
        });
        list.forEach(element => widget.append(element[0], element[1]));
        this._settings.bind(property_name, widget, 'active-id', Gio.SettingsBindFlags.DEFAULT);
        if (next_row) {this.row_pos += 1;}
        this.attach(widget, col, this.row_pos, 1, 1);
    },

    _createNumber(property_name, decimal=false, range, increments, col=0, next_row=false) {
        let widget = new Gtk.SpinButton({
            halign: Gtk.Align.END,
            margin_end: 16
        });
        widget.set_sensitive(true);
        widget.set_range(range[0], range[1]);
        widget.set_increments(increments[0], increments[1]);
        if (decimal) {
            widget.set_digits(1);
            widget.set_value(this._settings.get_double(property_name));
        }
        else {
            widget.set_value(this._settings.get_int(property_name));
        }
        this._settings.bind(property_name, widget, 'value', Gio.SettingsBindFlags.DEFAULT);
        if (next_row) {this.row_pos += 1;}
        this.attach(widget, col, this.row_pos, 1, 1);
    },

    _createSwitch(property_name, col=0, next_row=false) {
        let widget = new Gtk.Switch({
            halign: Gtk.Align.END,
            margin_end: 16
        });
        this._settings.bind(property_name, widget, 'active', Gio.SettingsBindFlags.DEFAULT);
        if (next_row) {this.row_pos += 1;}
        this.attach(widget, col, this.row_pos, 1, 1);
    }
});

// Page for eye settings
const EyeSettings = new GObject.Class({
    Name: 'EyeSettings',
    Extends: EyeExtendedSettings,

    _init: function (params) {
        this.parent(params);

        this._createLabel(_("Shape"), [], 0, true);
        this._createList('eye-mode', [
            ["bulb", _("Round")],
            ["lids", _("Eyelid")]
        ], 1);

        this._createLabel(_("Location"), [], 0, true);
        this._createList('eye-position', [
            ["left", _("Left")],
            ["center", _("Center")],
            ["right", _("Right")]
        ], 1);

        this._createLabel(_("Position"), [], 0, true);
        this._createNumber('eye-position-weight',false, [-255, 255], [1, 2], 1);

        this._createLabel(_("Line Thickness"), [], 0, true);
        this._createNumber('eye-line-width', true, [0.0, 5.0], [0.1, 0.2], 1);

        this._createLabel(_("Margin"), [], 0, true);
        this._createNumber('eye-margin', true, [0.0, 5.0], [0.1, 0.2], 1);

        this._createLabel(_("Refresh interval (ms)"), [], 0, true);
        this._createNumber('eye-repaint-interval', false, [1, 1000], [10, 20], 1);
    }
});

// Page for mouse circle settings
const MouseCircleSettings = new GObject.Class({
    Name: 'MouseCircleSettings',
    Extends: EyeExtendedSettings,

    _init: function (params) {
        this.parent(params);

        this._createLabel(_("Click on the eye to turn it on"),['b', 'i'], 0, true);

        this._createLabel(_("Enable"), [], 0, true);
        this._createSwitch('mouse-circle-enable', 1);

        this._createLabel(_("Shape"), [], 0, true);
        this._createNumber('mouse-circle-mode', false, [1, 18], [1, 2], 1);

        this._createLabel(_("Size"), [], 0, true);
        this._createNumber('mouse-circle-size', false, [1, 500], [10, 20], 1);

        this._createLabel(_("Opacity"), [], 0, true);
        this._createNumber('mouse-circle-opacity', false, [1, 255], [10, 20], 1);

        this._createLabel(_("Refresh interval (ms)"), [], 0, true);
        this._createNumber('mouse-circle-repaint-interval', false, [1, 1000], [10, 20], 1);

        this._createLabel(_("Enable left click coloring"), [], 0, true);
        this._createSwitch('mouse-circle-left-click-enable', 1);

        this._createLabel(_("Enable right click coloring"), [], 0, true);
        this._createSwitch('mouse-circle-right-click-enable', 1);

        this._createLabel(_("Enable middle click coloring"), [], 0, true);
        this._createSwitch('mouse-circle-middle-click-enable', 1);
    }
});

// Page color  eye settings
const ColorSettings = new GObject.Class({
    Name: 'ColorSettings',
    Extends: EyeExtendedSettings,

    _init: function (params) {
        this.parent(params);

        this._createLabel(_("Default"), [], 0, true);
        this._createColor('mouse-circle-color', 1);

        this._createLabel(_("Left click"), [], 0, true);
        this._createColor('mouse-circle-left-click-color', 1);

        this._createLabel(_("Right click"), [], 0, true);
        this._createColor('mouse-circle-right-click-color', 1);

        this._createLabel(_("Middle click"), [], 0, true);
        this._createColor('mouse-circle-middle-click-color', 1);
    }
});

// Settings Menu
const Notebook =  new GObject.Class({
    Name: 'Notebook',
    Extends: Gtk.Notebook,

    _init(params) {
        this.parent(params);

        this.append_page(new EyeSettings, new Gtk.Label({ label: _("Eye") }));
        this.append_page(new MouseCircleSettings, new Gtk.Label({ label: _("Mouse indicator") }));
        this.append_page(new ColorSettings, new Gtk.Label({ label: _("Color") }));
    }
});

// Insert the menu in the preference window
function buildPrefsWidget() {
    let widget = new Notebook();
    return widget;
}
