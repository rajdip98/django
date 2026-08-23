"""Analytics dashboard for club administrators.

Mounted at /analytics/ behind the Java gateway. It has no login of its own by
design: the gateway asks Django whether the caller holds a signed-in staff
session and refuses to proxy the request otherwise, so there is exactly one
account system for the whole platform.

Because of that, this process must bind to localhost. If it is exposed
directly to the internet, the gateway is bypassed and so is the only check
standing in front of it.
"""
from __future__ import annotations

import os
from datetime import date, timedelta

import plotly.graph_objects as go
from dash import Dash, dcc, html, Input, Output

import db

NAVY = '#0b2545'
GOLD = '#b8860b'
GREEN = '#16704a'
MAROON = '#8c2f39'

app = Dash(__name__, requests_pathname_prefix='/analytics/',
           routes_pathname_prefix='/analytics/', title='Club analytics')
server = app.server          # what gunicorn serves


# --------------------------------------------------------------------------
# Queries. Every one is parameterised; those that belong to a single website
# are scoped by tenant, and the two that are installation-wide say so.
# --------------------------------------------------------------------------

def tenants() -> list[tuple[int, str]]:
    """The websites on this installation. Tenant lives in the saas app."""
    return [(int(row[0]), str(row[1]))
            for row in db.rows('SELECT id, name FROM saas_tenant ORDER BY name')]


def totals(tenant_id: int) -> dict:
    return {
        # Member accounts are shared across the installation rather than owned
        # by one website, so this count is not scoped by tenant.
        'members': db.scalar('SELECT COUNT(*) FROM club_memberprofile'),
        'events': db.scalar(
            'SELECT COUNT(*) FROM club_event WHERE tenant_id = %s', (tenant_id,)),
        'registrations': db.scalar(
            'SELECT COUNT(*) FROM club_eventregistration r '
            'JOIN club_event e ON e.id = r.event_id WHERE e.tenant_id = %s', (tenant_id,)),
        'enquiries': db.scalar(
            'SELECT COUNT(*) FROM club_contactmessage WHERE tenant_id = %s', (tenant_id,)),
    }


def registrations_by_month(tenant_id: int, months: int = 12) -> tuple[list, list]:
    since = date.today().replace(day=1) - timedelta(days=31 * months)
    result = db.rows(
        """
        SELECT DATE_FORMAT(r.created_at, '%%Y-%%m') AS bucket, COUNT(*)
        FROM club_eventregistration r
        JOIN club_event e ON e.id = r.event_id
        WHERE e.tenant_id = %s AND r.created_at >= %s
        GROUP BY bucket ORDER BY bucket
        """, (tenant_id, since))
    return [row[0] for row in result], [int(row[1]) for row in result]


def events_by_category(tenant_id: int) -> tuple[list, list]:
    result = db.rows(
        """
        SELECT COALESCE(c.name, 'Uncategorised'), COUNT(*)
        FROM club_event e
        LEFT JOIN club_category c ON c.id = e.category_id
        WHERE e.tenant_id = %s
        GROUP BY c.name ORDER BY COUNT(*) DESC
        """, (tenant_id,))
    return [str(row[0]) for row in result], [int(row[1]) for row in result]


def membership_by_status(tenant_id: int) -> tuple[list, list]:
    """Membership is installation-wide, so this is not scoped by tenant either."""
    result = db.rows(
        """
        SELECT status, COUNT(*) FROM club_memberprofile
        GROUP BY status ORDER BY COUNT(*) DESC
        """)
    return [str(row[0]).title() for row in result], [int(row[1]) for row in result]



# --------------------------------------------------------------------------
# Layout
# --------------------------------------------------------------------------

def tile(label: str, value) -> html.Div:
    return html.Div([
        html.Div(f'{value:,}' if isinstance(value, int) else str(value),
                 style={'fontSize': '2rem', 'fontWeight': 700, 'color': NAVY,
                        'fontFamily': 'Georgia, serif', 'lineHeight': 1}),
        html.Div(label, style={'fontSize': '.8rem', 'textTransform': 'uppercase',
                               'letterSpacing': '.06em', 'color': '#5a6672', 'marginTop': 4}),
    ], style={'background': '#fff', 'border': '1px solid #d7dee7', 'borderLeft': f'4px solid {NAVY}',
              'borderRadius': 6, 'padding': '16px 18px', 'flex': '1 1 180px'})


def styled(figure: go.Figure, title: str, legend: bool = False) -> go.Figure:
    figure.update_layout(
        title=title, title_font={'family': 'Georgia, serif', 'size': 16, 'color': NAVY},
        paper_bgcolor='#fff', plot_bgcolor='#f4f6f9', margin={'l': 50, 'r': 20, 't': 54, 'b': 44},
        font={'family': 'Segoe UI, system-ui, sans-serif', 'size': 12, 'color': '#17202a'},
        height=340, showlegend=legend,
    )
    return figure


app.layout = html.Div([
    html.Div([
        html.Div([
            html.H1('Club analytics',
                    style={'margin': 0, 'fontFamily': 'Georgia, serif', 'fontSize': '1.3rem',
                           'color': '#fff'}),
            html.P('Membership, events and enquiries — read directly from the club database.',
                   style={'margin': '4px 0 0', 'color': '#b9c9e0', 'fontSize': '.85rem'}),
        ], style={'flex': 1}),
        html.A('← Back to the admin panel', href='/adminpanel/',
               style={'color': '#e8c565', 'fontSize': '.88rem', 'textDecoration': 'none'}),
    ], style={'background': NAVY, 'padding': '18px 26px', 'display': 'flex',
              'alignItems': 'center', 'gap': 16, 'flexWrap': 'wrap'}),

    html.Div([
        html.Label('Website', htmlFor='tenant',
                   style={'fontWeight': 600, 'fontSize': '.88rem', 'marginRight': 10}),
        dcc.Dropdown(id='tenant', options=[], value=None, clearable=False,
                     style={'minWidth': 320, 'display': 'inline-block'}),
    ], style={'padding': '16px 26px', 'background': '#eef2f7', 'borderBottom': '1px solid #d7dee7'}),

    html.Div(id='tiles', style={'display': 'flex', 'gap': 16, 'flexWrap': 'wrap',
                                'padding': '22px 26px'}),

    html.Div([
        dcc.Graph(id='registrations', config={'displayModeBar': False},
                  style={'flex': '1 1 480px'}),
        dcc.Graph(id='categories', config={'displayModeBar': False}, style={'flex': '1 1 360px'}),
        dcc.Graph(id='statuses', config={'displayModeBar': False}, style={'flex': '1 1 360px'}),
    ], style={'display': 'flex', 'gap': 18, 'flexWrap': 'wrap', 'padding': '0 26px 26px'}),

    html.Div(id='problem', style={'padding': '0 26px 26px', 'color': MAROON, 'fontSize': '.9rem'}),

    dcc.Interval(id='boot', interval=1000, max_intervals=1),
], style={'fontFamily': 'Segoe UI, system-ui, sans-serif', 'background': '#f4f6f9',
          'minHeight': '100vh'})


@app.callback(Output('tenant', 'options'), Output('tenant', 'value'),
              Input('boot', 'n_intervals'))
def fill_tenants(_):
    try:
        available = tenants()
    except Exception as error:                       # noqa: BLE001 — shown to the operator
        # Swallowing this would report a broken query as "no websites yet",
        # and the two need completely different fixes.
        print(f'analytics: could not list websites: {error}', flush=True)
        return [], None

    if not available:
        return [], None
    return ([{'label': name, 'value': identifier} for identifier, name in available],
            available[0][0])


@app.callback(Output('tiles', 'children'), Output('registrations', 'figure'),
              Output('categories', 'figure'), Output('statuses', 'figure'),
              Output('problem', 'children'), Input('tenant', 'value'))
def refresh(tenant_id):
    empty = go.Figure()
    if not tenant_id:
        return ([], styled(empty, 'Registrations'), styled(go.Figure(), 'Events by category'),
                styled(go.Figure(), 'Membership by status'),
                'Select a website, or check that DATABASE_URL points at the club database.')

    try:
        counts = totals(tenant_id)
        months, registrations = registrations_by_month(tenant_id)
        categories, category_counts = events_by_category(tenant_id)
        statuses, status_counts = membership_by_status(tenant_id)
    except Exception as error:                       # noqa: BLE001 — surfaced to the operator
        return ([], styled(empty, 'Registrations'), styled(go.Figure(), 'Events by category'),
                styled(go.Figure(), 'Membership by status'),
                f'The dashboard could not read the database: {error}')

    tiles = [tile('Members', counts['members']), tile('Events', counts['events']),
             tile('Registrations', counts['registrations']), tile('Enquiries', counts['enquiries'])]

    trend = go.Figure(go.Bar(x=months, y=registrations, marker_color=NAVY))
    trend.update_xaxes(type='category')
    trend.update_yaxes(gridcolor='#d7dee7', rangemode='tozero', dtick=1)

    pie = go.Figure(go.Pie(labels=categories, values=category_counts, hole=.55,
                           marker={'colors': [NAVY, GOLD, GREEN, MAROON, '#1d4e89', '#5a6672']}))

    bars = go.Figure(go.Bar(x=status_counts, y=statuses, orientation='h', marker_color=GREEN))
    bars.update_xaxes(gridcolor='#d7dee7', rangemode='tozero', dtick=1)

    return (tiles, styled(trend, 'Event registrations by month'),
            styled(pie, 'Events by category', legend=True),
            styled(bars, 'Membership by status'), '')


if __name__ == '__main__':
    # Localhost only: the gateway is what stands between this and the internet.
    app.run(host='127.0.0.1', port=int(os.environ.get('DASH_PORT', '8050')), debug=False)
