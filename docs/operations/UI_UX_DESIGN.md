# UI/UX design specification

RAMSport uses a professional engineering-workbench visual language: restrained color,
consistent Segoe UI/Inter typography, clear hierarchy, predictable controls, and no platform-
specific command assumptions.

The dashboard follows a desktop file-manager model with places, breadcrumbs, back/refresh,
grid/list views, folders, file extensions, and contextual project creation. Workspaces keep
component libraries on the left, the editor central, and selection/results in a collapsible
right pane contained above the zoom/status bar.

Minimum body/control text is 12 px at supported desktop widths; primary values and pane titles
are larger. Keyboard focus must be visible, icon-only controls need accessible names, dialogs
must trap focus, and state may not be communicated by color alone. Loading skeletons must
match the geometry of the content they replace. Destructive actions require confirmation.

Security errors should disclose neither account existence nor internal paths. A 401 returns
the user to login; 403 explains insufficient permission; 429 asks the user to retry later.

