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

        let r = -1;

        this.parent(params);
        this.margin = 24;
        this.spacing = 30;
        this.row_spacing = 4;
        this._settings = Convenience.getSettings();

        let label = null
        let widget = null;
        let value = null;

        // Mouse circle properties
        // =======================
        label = new Gtk.Label({
            hexpand: true,
            halign: Gtk.Align.START
        });
        label.set_markup('<b>' + _('Eye properties') + '</b>');
        this.attach(label, 0, ++r, 1, 1);
      
        // Eye mode
        label = new Gtk.Label({
            label: _('Eye mode'),
            hexpand: true,
            halign: Gtk.Align.START
          });
        widget = new Gtk.ComboBoxText();
        widget.append("bulb", _("Bulb"));
        widget.append("lids", _("Lids"));
        this._settings.bind('eye-mode', widget, 'active-id', Gio.SettingsBindFlags.DEFAULT);
        this.attach(label, 0, ++r, 1, 1);
        this.attach(widget, 1, r, 1, 1);     
        
        // Eye Position 
        label = new Gtk.Label({
            label: _('Eye position'),
            hexpand: true,
            halign: Gtk.Align.START
        });
        widget = new Gtk.ComboBoxText();
        widget.append("center", _("Center"));
        widget.append("right", _("Right"));
        widget.append("left", _("Left"));
        this._settings.bind('eye-position', widget, 'active-id', Gio.SettingsBindFlags.DEFAULT);
        this.attach(label, 0, ++r, 1, 1);
        this.attach(widget, 1, r, 1, 1);

        // Eye position weight
        label = new Gtk.Label({
            label: _('Eye position weight'),
            hexpand: true,
            halign: Gtk.Align.START
        });
        widget = new Gtk.SpinButton({halign: Gtk.Align.END});
        widget.set_sensitive(true);
        widget.set_range(-255, 255);
        widget.set_value(this._settings.get_int('eye-position-weight'));
        widget.set_increments(1, 2);
        widget.connect('value-changed', Lang.bind(this, function(w){
             value = w.get_value_as_int();
             this._settings.set_int('eye-position-weight', value);
        }));
        this.attach(label, 0, ++r, 1, 1);
        this.attach(widget, 1, r, 1, 1);

        // Eye line width
        label = new Gtk.Label({
            label: _('Eye line width'),
            hexpand: true,
            halign: Gtk.Align.START
        });
        widget = new Gtk.SpinButton({halign:Gtk.Align.END, digits:1});
        widget.set_sensitive(true);
        widget.set_range(0.0, 5.0);
        widget.set_value(this._settings.get_double('eye-line-width'));
        widget.set_increments(0.1, 0.2);
        widget.connect('value-changed', Lang.bind(this, function(w){
            value = w.get_value();
            this._settings.set_double('eye-line-width', value);
         }));
        this.attach(label, 0, ++r, 1, 1);
        this.attach(widget, 1, r, 1, 1);        

        // Eye margin
        label = new Gtk.Label({
            label: _('Eye margin'),
            hexpand: true,
            halign: Gtk.Align.START
        });
        widget = new Gtk.SpinButton({halign:Gtk.Align.END, digits:1});
        widget.set_sensitive(true);
        widget.set_range(0.0, 5.0);
        widget.set_value(this._settings.get_double('eye-margin'));
        widget.set_increments(0.1, 0.2);
        widget.connect('value-changed', Lang.bind(this, function(w){
            value = w.get_value();
            this._settings.set_double('eye-margin', value);
         }));
        this.attach(label, 0, ++r, 1, 1);
        this.attach(widget, 1, r, 1, 1);          

        // Mouse circle properties
        // =======================
        label = new Gtk.Label({
            hexpand: true,
            halign: Gtk.Align.START
        });
        label.set_markup('<b>' + _('Mouse circle properties') + '</b>');
        this.attach(label, 0, ++r, 1, 1);

        label = new Gtk.Label({
            hexpand: true,
            halign: Gtk.Align.START
        });
        label.set_markup('<i>' + _('To activate, click on the eye') + '</i>');
        this.attach(label, 0, ++r, 1, 1);

        // Mouse circle mode
        label = new Gtk.Label({
            label: _('Mouse circle mode'),
            hexpand: true,
            halign: Gtk.Align.START
        });
        widget = new Gtk.SpinButton({halign: Gtk.Align.END});
        widget.set_sensitive(true);
        widget.set_range(1, 18);
        widget.set_value(this._settings.get_int('mouse-circle-mode'));
        widget.set_increments(1, 2);
        widget.connect('value-changed', Lang.bind(this, function(w){
             value = w.get_value_as_int();
             this._settings.set_int('mouse-circle-mode', value);
        }));
        this.attach(label, 0, ++r, 1, 1);
        this.attach(widget, 1, r, 1, 1);

        // Mouse circle size
        label = new Gtk.Label({
            label: _('Mouse circle size'),
            hexpand: true,
            halign: Gtk.Align.START
        });
        widget = new Gtk.SpinButton({halign: Gtk.Align.END});
        widget.set_sensitive(true);
        widget.set_range(1, 500);
        widget.set_value(this._settings.get_int('mouse-circle-size'));
        widget.set_increments(10, 20);
        widget.connect('value-changed', Lang.bind(this, function(w){
             value = w.get_value_as_int();
             this._settings.set_int('mouse-circle-size', value);
        }));
        this.attach(label, 0, ++r, 1, 1);
        this.attach(widget, 1, r, 1, 1);

        // Mouse circle opacity
        label = new Gtk.Label({
            label: _('Mouse circle opacity'),
            hexpand: true,
            halign: Gtk.Align.START
        });
        widget = new Gtk.SpinButton({halign: Gtk.Align.END});
        widget.set_sensitive(true);
        widget.set_range(1, 255);
        widget.set_value(this._settings.get_int('mouse-circle-opacity'));
        widget.set_increments(10, 20);
        widget.connect('value-changed', Lang.bind(this, function(w){
             value = w.get_value_as_int();
             this._settings.set_int('mouse-circle-opacity', value);
        }));
        this.attach(label, 0, ++r, 1, 1);
        this.attach(widget, 1, r, 1, 1);

        //this._changedPermitted = true;
    },

});

function buildPrefsWidget() {
     let widget = new EyeExtendedSettings();
     widget.show_all();

     return widget;
}
