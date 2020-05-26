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

        // Position weight
        label = new Gtk.Label({
            label: _('Position weight'),
            hexpand: true,
            halign: Gtk.Align.START
        });
        widget = new Gtk.SpinButton({halign: Gtk.Align.END});
        widget.set_sensitive(true);
        widget.set_range(-255, 255);
        widget.set_value(this._settings.get_int('position-weight'));
        widget.set_increments(1, 2);
        widget.connect('value-changed', Lang.bind(this, function(w){
             value = w.get_value_as_int();
             this._settings.set_int('position-weight', value);
        }));
        this.attach(label, 0, ++r, 1, 1);
        this.attach(widget, 1, r, 1, 1);

        // Line width
        label = new Gtk.Label({
            label: _('Line width'),
            hexpand: true,
            halign: Gtk.Align.START
        });
        widget = new Gtk.SpinButton({halign:Gtk.Align.END, digits:1});
        widget.set_sensitive(true);
        widget.set_range(0.0, 5.0);
        widget.set_value(this._settings.get_double('line-width'));
        widget.set_increments(0.1, 0.2);
        widget.connect('value-changed', Lang.bind(this, function(w){
            value = w.get_value();
            this._settings.set_double('line-width', value);
         }));
        this.attach(label, 0, ++r, 1, 1);
        this.attach(widget, 1, r, 1, 1);        

        // Margin
        label = new Gtk.Label({
            label: _('Margin'),
            hexpand: true,
            halign: Gtk.Align.START
        });
        widget = new Gtk.SpinButton({halign:Gtk.Align.END, digits:1});
        widget.set_sensitive(true);
        widget.set_range(0.0, 5.0);
        widget.set_value(this._settings.get_double('margin'));
        widget.set_increments(0.1, 0.2);
        widget.connect('value-changed', Lang.bind(this, function(w){
            value = w.get_value();
            this._settings.set_double('margin', value);
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
