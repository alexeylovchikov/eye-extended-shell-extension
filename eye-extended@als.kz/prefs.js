const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Gio = imports.gi.Gio;

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
        this.spacing = 30;
        this.row_spacing = 4;
        this._settings = Convenience.getSettings();
        
        this.row_pos = -1;

        // Eye properties
        // =======================
        this._createLable(_('Eye properties'), ['b']);

        this._createList(_('Eye mode'), 'eye-mode', [
            ["bulb", _("Bulb")], 
            ["lids", _("Lids")]
        ]);

        this._createList(_('Eye position'), 'eye-position', [
            ["center", _("Center")], 
            ["right", _("Right")], 
            ["left", _("Left")]
        ]);

        this._createInt(_('Eye position weight'), 'eye-position-weight', [-255, 255], [1, 2]);
        this._createDouble(_('Eye line width'), 'eye-line-width', [0.0, 5.0], [0.1, 0.2]);
        this._createDouble(_('Eye margin'), 'eye-margin', [0.0, 5.0], [0.1, 0.2]);
        this._createInt(_('Eye repaint interval'), 'eye-repaint-interval', [1, 1000], [10, 20]);
    
        // Mouse circle properties
        // =======================
        this._createLable(_('Mouse circle properties'), ['b']);
        this._createLable(_('To activate, click on the eye'), ['b', 'i']);

        this._createInt(_('Mouse circle mode'), 'mouse-circle-mode', [1, 18], [1, 2]);
        this._createInt(_('Mouse circle size'), 'mouse-circle-size', [1, 500], [10, 20]);
        this._createInt(_('Mouse circle opacity'), 'mouse-circle-opacity', [1, 255], [10, 20]);
        this._createInt(_('Mouse circle repaint interval'), 'mouse-circle-repaint-interval', [1, 1000], [10, 20]);

        //this._changedPermitted = true;
    },

    _createLable(text, style) {
        let label = null;
        this.row_pos = this.row_pos + 1;
        label = new Gtk.Label({
            hexpand: true,
            halign: Gtk.Align.START
        });
        style.forEach(element => text = "<" + element + ">" + text + "</" + element + ">");
        label.set_markup(text);
        this.attach(label, 0, this.row_pos, 1, 1);
    },

    _createList(text, property_name, list) 
    {
        let label = null;
        let widget = null;
        this.row_pos = this.row_pos + 1;
        label = new Gtk.Label({
            label: text,
            hexpand: true,
            halign: Gtk.Align.START
        });
        widget = new Gtk.ComboBoxText();
        list.forEach(element => widget.append(element[0], element[1]));
        this._settings.bind(property_name, widget, 'active-id', Gio.SettingsBindFlags.DEFAULT);
        this.attach(label, 0, this.row_pos, 1, 1);
        this.attach(widget, 1, this.row_pos, 1, 1);        
    },

    _createInt(text, property_name, range, increments)
    {
        let label = null;
        let widget = null;
        let value = null;
        this.row_pos = this.row_pos + 1;
        label = new Gtk.Label({
            label: text,
            hexpand: true,
            halign: Gtk.Align.START
        });
        widget = new Gtk.SpinButton({halign: Gtk.Align.END});
        widget.set_sensitive(true);
        widget.set_range(range[0], range[1]);
        widget.set_value(this._settings.get_int(property_name));
        widget.set_increments(increments[0], increments[1]);
        widget.connect('value-changed', Lang.bind(this, function(w){
             value = w.get_value_as_int();
             this._settings.set_int(property_name, value);
        }));
        this.attach(label, 0, this.row_pos, 1, 1);
        this.attach(widget, 1, this.row_pos, 1, 1);
    },

    _createDouble(text, property_name, range, increments)
    {
        let label = null;
        let widget = null;
        let value = null;
        this.row_pos = this.row_pos + 1;
        label = new Gtk.Label({
            label: text,
            hexpand: true,
            halign: Gtk.Align.START
        });
        widget = new Gtk.SpinButton({halign:Gtk.Align.END, digits:1});
        widget.set_sensitive(true);
        widget.set_range(range[0], range[1]);
        widget.set_value(this._settings.get_double(property_name));
        widget.set_increments(increments[0], increments[1]);
        widget.connect('value-changed', Lang.bind(this, function(w){
            value = w.get_value();
            this._settings.set_double(property_name, value);
         }));
        this.attach(label, 0, ++this.row_pos, 1, 1);
        this.attach(widget, 1, this.row_pos, 1, 1);       
    },

});

function buildPrefsWidget() {
     let widget = new EyeExtendedSettings();
     widget.show_all();

     return widget;
}
