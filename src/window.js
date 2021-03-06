/* window.js
 *
 * Copyright 2020 Martin Abente Lahaye
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const {GObject, Gtk} = imports.gi;
const {Leaflet, TitleBar, SwipeGroup, Column} = imports.gi.Handy;

const {FlatpakApplicationsModel} = imports.models.applications;
const {FlatpakPermissionsModel} = imports.models.permissions;

const {FlatsealAppInfoViewer} = imports.appInfoViewer;
const {FlatsealApplicationRow} = imports.applicationRow;
const {FlatsealGroupRow} = imports.groupRow;
const {FlatsealPermissionEntryRow} = imports.permissionEntryRow;
const {FlatsealPermissionSwitchRow} = imports.permissionSwitchRow;
const {FlatsealResetButton} = imports.resetButton;

const _bindFlags = GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE;
const _bindReadFlags = GObject.BindingFlags.SYNC_CREATE;


var FlatsealWindow = GObject.registerClass({
    GTypeName: 'FlatsealWindow',
    Template: 'resource:///com/github/tchx84/Flatseal/window.ui',
    InternalChildren: [
        'applicationsSearchEntry',
        'applicationsStack',
        'applicationsListBox',
        'applicationsHeaderBar',
        'permissionsHeaderBar',
        'permissionsStack',
        'permissionsBox',
        'resetBox',
        'menuButton',
        'backButton',
        'headerLeaflet',
        'contentLeaflet',
        'swipeGroup',
    ],
}, class FlatsealWindow extends Gtk.ApplicationWindow {
    _init(application) {
        super._init({application});
        this._setup();
        this.maximize();
    }

    _setup() {
        const builder = Gtk.Builder.new_from_resource('/com/github/tchx84/Flatseal/menu.ui');
        this._menuButton.set_menu_model(builder.get_object('menu'));

        this._resetButton = new FlatsealResetButton();
        this._resetBox.add(this._resetButton);

        this._headerLeaflet.bind_property(
            'folded', this._backButton, 'visible', _bindReadFlags);
        this._setupHeaders();

        this._permissions = new FlatpakPermissionsModel();
        this._applications = new FlatpakApplicationsModel();

        const applications = this._applications.getAll();
        const permissions = this._permissions.getAll();

        if (applications.length === 0 || permissions.length === 0)
            return;

        const iconTheme = Gtk.IconTheme.get_default();

        applications.forEach(app => {
            iconTheme.append_search_path(app.appThemePath);
            const row = new FlatsealApplicationRow(app.appId, app.appName);
            this._applicationsListBox.add(row);
        });

        this._appInfoViewer = new FlatsealAppInfoViewer();
        this._appInfoViewer.show();
        this._permissionsBox.add(this._appInfoViewer);
        this._headerLeaflet.bind_property(
            'folded', this._appInfoViewer, 'compact', _bindReadFlags);

        var lastGroup = '';

        permissions.forEach(p => {
            var row;

            if (p.type === 'text')
                row = new FlatsealPermissionEntryRow(p.description, p.permission, p.value);
            else
                row = new FlatsealPermissionSwitchRow(p.description, p.permission, p.value);

            const context = row.get_style_context();
            context.add_class(p.group);

            if (p.group !== lastGroup) {
                const groupRow = new FlatsealGroupRow(p.group, p.groupDescription);
                this._permissionsBox.add(groupRow);
                lastGroup = p.group;
            }

            row.sensitive = p.supported;
            this._permissionsBox.add(row);
            this._permissions.bind_property(p.property, row.content, p.type, _bindFlags);
        });

        this.connect('destroy', this._shutdown.bind(this));
        this._permissions.connect('changed', this._changed.bind(this));

        this._permissionsStack.visibleChildName = 'withPermissionsPage';
        this._applicationsStack.visibleChildName = 'withApplicationsPage';

        this._applicationsListBox.connect('row-selected', this._update.bind(this));
        this._applicationsListBox.set_filter_func(this._filter.bind(this));

        this._applicationsSearchEntry.connect('stop-search', this._cancel.bind(this));
        this._applicationsSearchEntry.connect('search-changed', this._invalidate.bind(this));

        this._resetButton.set_sensitive(true);
        this._resetButton.connect('clicked', this._reset.bind(this));

        this._backButton.connect('clicked', this._showApplications.bind(this));
        this._contentLeaflet.connect('notify::folded', this._showPermissions.bind(this));

        /* XXX shouldn't do this automatically ? */
        const row = this._applicationsListBox.get_row_at_index(0);
        this._applicationsListBox.select_row(row);
    }

    _shutdown() {
        this._permissions.shutdown();
    }

    _changed(model, overriden) {
        this._resetButton.set_sensitive(overriden);
    }

    _update() {
        const row = this._applicationsListBox.get_selected_row();
        this._permissions.appId = row.appId;
        this._permissionsHeaderBar.set_title(row.appName);
        this.set_title(row.appName);
        this._appInfoViewer.appId = row.appId;
        this._showPermissions();
    }

    _reset() {
        this._permissions.reset();
    }

    _filter(row) {
        const text = this._applicationsSearchEntry.get_text();
        if (text.length === 0)
            return true;

        return row.appId.toLowerCase().includes(text.toLowerCase());
    }

    _invalidate() {
        this._applicationsListBox.invalidate_filter();
    }

    _cancel() {
        this._applicationsSearchEntry.set_text('');
    }

    _showApplications() {
        this._contentLeaflet.set_visible_child_name('applications');
        this._backButton.active = false;
    }

    _showPermissions() {
        this._contentLeaflet.set_visible_child_name('permissions');
    }

    /* XXX Is there better way to do this? */
    _setupHeaders() {
        const settings = Gtk.Settings.get_default();
        if (this._layoutNotifyId)
            settings.disconnect(this._layoutNotifyId);
        this._layoutNotifyId = settings.connect(
            'notify::gtk-decoration-layout', this._setupHeaders.bind(this));

        var mainBar = this._permissionsHeaderBar;
        var secondaryBar = this._applicationsHeaderBar;
        if (settings.gtk_decoration_layout.startsWith('close')) {
            mainBar = this._applicationsHeaderBar;
            secondaryBar = this._permissionsHeaderBar;
        }

        mainBar.show_close_button = true;
        secondaryBar.show_close_button = false;

        if (this._headerBinding)
            this._headerBinding.unbind();
        this._headerBinding = this._headerLeaflet.bind_property(
            'folded', secondaryBar, 'show-close-button', _bindReadFlags);
    }
});
