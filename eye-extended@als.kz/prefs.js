const GObject = imports.gi.GObject;
const Lang = imports.lang;
const Gtk = imports.gi.Gtk;
const Gio = imports.gi.Gio;
const Gdk = imports.gi.Gdk;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

function init() {
    Convenience.initTranslations();
}

const EyeExtendedSettings = new GObject.Class({
    Name: 'EyeExtendedPrefs',
    Extends: Gtk.Grid,

    _init: function(params) {

        this.parent(params);
        this.margin = 24;
        this.spacing = 28;
        this.row_spacing = 4;

        this._settings = Convenience.getSettings();
        
        this.row_pos = -1;

        // Eye properties
        // =======================
        this._createLable(_('Eye properties'), ['b'], 0, true);

        this._createLable(_('Eye mode'), [], 0, true);
        this._createList('eye-mode', [
            ["bulb", _("Bulb")], 
            ["lids", _("Lids")]
        ], 2);

        this._createLable(_('Eye position'), [], 0, true);
        this._createList('eye-position', [
            ["center", _("Center")], 
            ["right", _("Right")], 
            ["left", _("Left")]
        ], 2);

        this._createLable(_('Eye position weight'), [], 0, true);
        this._createInt('eye-position-weight', [-255, 255], [1, 2], 2);

        this._createLable(_('Eye line width'), [], 0, true);
        this._createDouble('eye-line-width', [0.0, 5.0], [0.1, 0.2], 2);

        this._createLable(_('Eye margin'), [], 0, true);
        this._createDouble('eye-margin', [0.0, 5.0], [0.1, 0.2], 2);

        this._createLable(_('Eye repaint interval'), [], 0, true);
        this._createInt('eye-repaint-interval', [1, 1000], [10, 20], 2);
    
        // Mouse circle properties
        // =======================
        this._createLable(_('Mouse circle properties'),['b'], 0, true);
        this._createLable(_('To activate, click on the eye'),['b', 'i'], 0, true);

        this._createLable(_('Mouse circle mode'), [], 0, true);
        this._createInt('mouse-circle-mode', [1, 18], [1, 2], 2);

        this._createLable(_('Mouse circle size'), [], 0, true);
        this._createInt('mouse-circle-size', [1, 500], [10, 20], 2);

        this._createLable(_('Mouse circle opacity'), [], 0, true);
        this._createInt('mouse-circle-opacity', [1, 255], [10, 20], 2);

        this._createLable(_('Mouse circle repaint interval'), [], 0, true);
        this._createInt('mouse-circle-repaint-interval', [1, 1000], [10, 20], 2);

        this._createLable(_('Mouse circle color'), [], 0, true);
        this._createSwitch('mouse-circle-enable', 2);
        this._createColor('mouse-circle-color', 2);

        this._createLable(_('Mouse circle left click color'), [], 0, true);
        this._createSwitch('mouse-circle-left-click-enable', 2);
        this._createColor('mouse-circle-left-click-color', 2);

        this._createLable(_('Mouse circle right click color'), [], 0, true);
        this._createSwitch('mouse-circle-right-click-enable', 2);
        this._createColor('mouse-circle-right-click-color', 2);

        //this._changedPermitted = true;
    },

    _createLable(text, style=[], col=0, next_row=false) {
        let label = null;
        label = new Gtk.Label({
            hexpand: true,
            halign: Gtk.Align.START
        });
        if (style.length > 0) {
            style.forEach(element => text = "<" + element + ">" + text + "</" + element + ">");
            label.set_markup(text);
        } else {
            label.set_text(text);
        }
        if (next_row) {
            this.row_pos = this.row_pos + 1;
        }
        this.attach(label, col, this.row_pos, 1, 1);
    },

    _createColor(property_name, col=0, next_row=false)
    {
        let widget = null;
        let color = null;
        widget = new Gtk.ColorButton({halign: Gtk.Align.END});
        widget.set_color(Gdk.Color.parse(this._settings.get_string(property_name)).pop());
        widget.connect('color-set', (button) => {
            color = button.get_color().to_string();
            color = color[0] + color[1] + color[2] + color[5] + color[6] + color[9] + color[10];
            this._settings.set_string(property_name, color);
        });
        if (next_row) {
            this.row_pos = this.row_pos + 1;
        }
        this.attach(widget, col, this.row_pos, 1, 1);
    },

    _createList(property_name, list, col=0, next_row=false)
    {
        let widget = null;
        widget = new Gtk.ComboBoxText();
        list.forEach(element => widget.append(element[0], element[1]));
        this._settings.bind(property_name, widget, 'active-id', Gio.SettingsBindFlags.DEFAULT);
        if (next_row) {
            this.row_pos = this.row_pos + 1;
        }
        this.attach(widget, col, this.row_pos, 1, 1);
    },

    _createInt(property_name, range, increments, col=0, next_row=false, test=0)
    {
        let widget = null;
        let value = null;
        widget = new Gtk.SpinButton({halign: Gtk.Align.END});
        widget.set_sensitive(true);
        widget.set_range(range[0], range[1]);
        widget.set_value(this._settings.get_int(property_name));
        widget.set_increments(increments[0], increments[1]);
        widget.connect('value-changed', Lang.bind(this, function(w){
             value = w.get_value_as_int();
             this._settings.set_int(property_name, value);
        }));
        if (next_row) {
            this.row_pos = this.row_pos + 1;
        }
        this.attach(widget, col, this.row_pos, 1, 1);
    },

    _createDouble(property_name, range, increments, col=0, next_row=false)
    {
        let widget = null;
        let value = null;
        widget = new Gtk.SpinButton({halign:Gtk.Align.END, digits:1});
        widget.set_sensitive(true);
        widget.set_range(range[0], range[1]);
        widget.set_value(this._settings.get_double(property_name));
        widget.set_increments(increments[0], increments[1]);
        widget.connect('value-changed', Lang.bind(this, function(w){
            value = w.get_value();
            this._settings.set_double(property_name, value);
         }));
        if (next_row) {
            this.row_pos = this.row_pos + 1;
        }
        this.attach(widget, col, this.row_pos, 1, 1);
    },

    _createSwitch(property_name, col=0, next_row=false) {
        let widget = null;
        widget = new Gtk.Switch({halign: Gtk.Align.START});
        this._settings.bind(property_name, widget, 'active', Gio.SettingsBindFlags.DEFAULT);
        if (next_row) {
            this.row_pos = this.row_pos + 1;
        }
        this.attach(widget, col, this.row_pos, 1, 1);
    }
});

function buildPrefsWidget() {
     let widget = new EyeExtendedSettings();
     widget.show_all();

     return widget;
}
