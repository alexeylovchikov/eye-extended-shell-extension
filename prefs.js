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

const Lang = imports.lang;// helper library to point to and connect objects

const ExtensionUtils = imports.misc.extensionUtils;// access to settings from schema
const Me = ExtensionUtils.getCurrentExtension();

const Domain = imports.gettext.domain(Me.metadata.uuid);// object with functions for marking strings as translatable
const _ = Domain.gettext;// tool to get translations

function init() {
    ExtensionUtils.initTranslations(Me.metadata.uuid);
}

// Class to create options and labels in the settings menu
const EyeExtendedSettings = new GObject.Class({
    Name: 'EyeExtendedSettings',
    Extends: Gtk.Grid,

    _init: function(params) {
        this.parent(params);

        // Spacing values
        this.vexpand = true;
        this.margin_top = 16;
        this.margin_bottom = 8;
        this.row_spacing = 12;

        this.row_pos = -1;// row position on a page

        this._settings = ExtensionUtils.getSettings();// connect to settings
    },

    _createLabel(text, style=[], col=0, next_row=false) {
        let label = null;
        label = new Gtk.Label({
            hexpand: true,
            halign: Gtk.Align.START,
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
        let widget = null;
        let color = null;
        widget = new Gtk.ColorButton({
            halign: Gtk.Align.END,
            margin_end: 16
        });
        let gdk_color = new Gdk.RGBA();
            if (gdk_color.parse(this._settings.get_string(property_name))){
                widget.set_rgba(gdk_color);
            }
        widget.connect('color-set', (button) => {
            color = button.get_rgba().to_string();
            this._settings.set_string(property_name, color);
        });
        if (next_row) {this.row_pos += 1;}
        this.attach(widget, col, this.row_pos, 1, 1);
    },

    _createList(property_name, list, col=0, next_row=false) {
        let widget = null;
        widget = new Gtk.ComboBoxText({
            halign: Gtk.Align.END,
            margin_end: 16
        });
        list.forEach(element => widget.append(element[0], element[1]));
        this._settings.bind(property_name, widget, 'active-id', Gio.SettingsBindFlags.DEFAULT);
        if (next_row) {this.row_pos += 1;}
        this.attach(widget, col, this.row_pos, 1, 1);
    },

    _createNumber(property_name, decimal=false, range, increments, col=0, next_row=false) {
        let widget = null;
        let value = null;
        widget = new Gtk.SpinButton({
            halign: Gtk.Align.END,
            margin_end: 16
        });
        widget.set_sensitive(true);
        widget.set_range(range[0], range[1]);
        widget.set_increments(increments[0], increments[1]);
        if (decimal) {
            widget.set_digits(1);
            widget.set_value(this._settings.get_double(property_name));
            widget.connect('value-changed', Lang.bind(this, function(w){
                value = w.get_value();
                this._settings.set_double(property_name, value);
             }));
        }
        else {
            widget.set_value(this._settings.get_int(property_name));
            widget.connect('value-changed', Lang.bind(this, function(w){
                value = w.get_value_as_int();
                this._settings.set_int(property_name, value);
           }));
        }
        if (next_row) {this.row_pos += 1;}
        this.attach(widget, col, this.row_pos, 1, 1);
    },

    _createSwitch(property_name, col=0, next_row=false) {
        let widget = null;
        widget = new Gtk.Switch({
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

        this._createLabel(_('Eye mode'), [], 0, true);
        this._createList('eye-mode', [
            ["bulb", _("Bulb")],
            ["lids", _("Lids")]
        ], 2);

        this._createLabel(_('Eye position'), [], 0, true);
        this._createList('eye-position', [
            ["center", _("Center")],
            ["right", _("Right")],
            ["left", _("Left")]
        ], 2);

        this._createLabel(_('Eye position weight'), [], 0, true);
        this._createNumber('eye-position-weight',false, [-255, 255], [1, 2], 2)

        this._createLabel(_('Eye line width'), [], 0, true);
        this._createNumber('eye-line-width', true, [0.0, 5.0], [0.1, 0.2], 2);

        this._createLabel(_('Eye margin'), [], 0, true);
        this._createNumber('eye-margin', true, [0.0, 5.0], [0.1, 0.2], 2);

        this._createLabel(_('Eye repaint interval'), [], 0, true);
        this._createNumber('eye-repaint-interval', false, [1, 1000], [10, 20], 2);
    }
});

// Page for mouse circle settings
const MouseCircleSettings = new GObject.Class({
    Name: 'MouseCircleSettings',
    Extends: EyeExtendedSettings,

    _init: function (params) {
        this.parent(params);

        this._createLabel(_('To activate, click on the eye'),['b', 'i'], 0, true);

        this._createLabel(_('Mouse circle mode'), [], 0, true);
        this._createNumber('mouse-circle-mode', false, [1, 18], [1, 2], 2);

        this._createLabel(_('Mouse circle size'), [], 0, true);
        this._createNumber('mouse-circle-size', false, [1, 500], [10, 20], 2);

        this._createLabel(_('Mouse circle opacity'), [], 0, true);
        this._createNumber('mouse-circle-opacity', false, [1, 255], [10, 20], 2);

        this._createLabel(_('Mouse circle repaint interval'), [], 0, true);
        this._createNumber('mouse-circle-repaint-interval', false, [1, 1000], [10, 20], 2);

        this._createLabel(_('Mouse circle enable'), [], 0, true);
        this._createSwitch('mouse-circle-enable', 2);

        this._createLabel(_('Mouse circle left click enable'), [], 0, true);
        this._createSwitch('mouse-circle-left-click-enable', 2);

        this._createLabel(_('Mouse circle right click enable'), [], 0, true);
        this._createSwitch('mouse-circle-right-click-enable', 2);

        this._createLabel(_('Mouse circle middle click enable'), [], 0, true);
        this._createSwitch('mouse-circle-middle-click-enable', 2);
    }
});

// Page color  eye settings
const ColorSettings = new GObject.Class({
    Name: 'ColorSettings',
    Extends: EyeExtendedSettings,

    _init: function (params) {
        this.parent(params);

        this._createLabel(_('Mouse circle color'), [], 0, true);
        this._createColor('mouse-circle-color', 2);

        this._createLabel(_('Mouse circle left click color'), [], 0, true);
        this._createColor('mouse-circle-left-click-color', 2);

        this._createLabel(_('Mouse circle right click color'), [], 0, true);
        this._createColor('mouse-circle-right-click-color', 2);

        this._createLabel(_('Mouse circle middle click color'), [], 0, true);
        this._createColor('mouse-circle-middle-click-color', 2);
    }
});

// Settings Menu
const Notebook =  new GObject.Class({
    Name: 'Notebook',
    Extends: Gtk.Notebook,

    _init(params) {
        this.parent(params);

        this.append_page(new EyeSettings, new Gtk.Label({ label: _('Eye properties') }));
        this.append_page(new MouseCircleSettings, new Gtk.Label({ label: _('Mouse circle properties') }));
        this.append_page(new ColorSettings, new Gtk.Label({ label: _('Color properties') }));
    }
});

// Insert the menu in the preference window
function buildPrefsWidget() {
    let widget = new Notebook();
    return widget;
}
