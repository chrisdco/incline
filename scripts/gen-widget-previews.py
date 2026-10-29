"""Generate static RemoteViews preview layouts for the widget picker."""
import os

ROOT = 'plugins/widget-previews/res'
A = 'xmlns:android="http://schemas.android.com/apk/res/android"'


def w(rel, body):
    p = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf8', newline='\n') as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n' + body.strip() + '\n')


GEN = '<!-- Generated preview (sample data). Keep in sync with src/widgets/. -->\n'

# ---------- colours (light + night) ----------
def colors(card, bg, fg, muted, primary, border, on_primary):
    return f'''
<resources>
  <color name="wp_card">{card}</color>
  <color name="wp_bg">{bg}</color>
  <color name="wp_fg">{fg}</color>
  <color name="wp_muted">{muted}</color>
  <color name="wp_primary">{primary}</color>
  <color name="wp_border">{border}</color>
  <color name="wp_on_primary">{on_primary}</color>
</resources>'''

w('values/widget_preview_colors.xml', colors('#FFFFFF', '#F9F9FB', '#09090B', '#62626A', '#6D5DF6', '#E4E4E7', '#FFFFFF'))
w('values-night/widget_preview_colors.xml', colors('#151519', '#0C0C0E', '#FAFAFA', '#AFAFB6', '#8B7CFF', '#242428', '#151519'))

# ---------- drawables ----------
def shape(kind, color=None, radius=None, stroke=None):
    inner = ''
    if color:
        inner += f'<solid android:color="@color/{color}" />'
    if radius:
        inner += f'<corners android:radius="{radius}dp" />'
    if stroke:
        inner += f'<stroke android:width="{stroke[0]}dp" android:color="@color/{stroke[1]}" />'
    return f'<shape {A} android:shape="{kind}">{inner}</shape>'

w('drawable/wp_card.xml', shape('rectangle', 'wp_card', 24))
w('drawable/wp_dot_on.xml', shape('oval', 'wp_primary'))
w('drawable/wp_dot_off.xml', shape('oval', 'wp_border'))
w('drawable/wp_dot_today.xml', shape('oval', 'wp_border', stroke=(2, 'wp_primary')))
w('drawable/wp_bar.xml', shape('rectangle', 'wp_primary', 4))
w('drawable/wp_bar_off.xml', shape('rectangle', 'wp_border', 4))
w('drawable/wp_tile.xml', shape('rectangle', 'wp_bg', 14, (1, 'wp_border')))
w('drawable/wp_divider.xml', shape('rectangle', 'wp_border'))


def text(t, size, color='wp_fg', bold=False, extra=''):
    style = ' android:textStyle="bold"' if bold else ''
    return (f'<TextView android:layout_width="wrap_content" android:layout_height="wrap_content" '
            f'android:text="{t}" android:textSize="{size}sp" android:textColor="@color/{color}"'
            f' android:maxLines="1"{style} {extra}/>')


def card(inner, orientation='vertical', pad=14, extra=''):
    return GEN + f'''<LinearLayout {A}
  android:layout_width="match_parent" android:layout_height="match_parent"
  android:orientation="{orientation}" android:padding="{pad}dp"
  android:background="@drawable/wp_card" {extra}>
{inner}
</LinearLayout>'''


def spacer():
    return '<FrameLayout android:layout_width="0dp" android:layout_height="0dp" android:layout_weight="1" />'


def vspacer():
    return '<FrameLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" />'


# ---------- Quick start ----------
w('layout/widget_preview_quick_start.xml', card(f'''
  <LinearLayout android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:orientation="vertical">
    {text('Quick start', 12, 'wp_muted')}
    {text('Start workout', 17, bold=True)}
  </LinearLayout>
  <FrameLayout android:layout_width="36dp" android:layout_height="36dp" android:background="@drawable/wp_dot_on">
    <TextView android:layout_width="match_parent" android:layout_height="match_parent" android:gravity="center"
      android:text="+" android:textSize="22sp" android:textColor="@color/wp_on_primary" />
  </FrameLayout>''', orientation='horizontal', extra='android:gravity="center_vertical"'))

# ---------- Streak ----------
w('layout/widget_preview_streak.xml', card(f'''
  <LinearLayout android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:orientation="vertical">
    {text('Streak', 12, 'wp_muted')}
    <LinearLayout android:layout_width="wrap_content" android:layout_height="wrap_content" android:orientation="horizontal" android:gravity="bottom">
      {text('12', 26, bold=True)}
      {text('weeks', 13, 'wp_muted', extra='android:layout_marginStart="4dp" android:layout_marginBottom="4dp"')}
    </LinearLayout>
    {text('Personal best', 10, 'wp_muted')}
  </LinearLayout>
  {text('🔥', 26)}''', orientation='horizontal', extra='android:gravity="center_vertical"'))

# ---------- This week ----------
LET = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
trained = [True, False, True, False, True, False, False]
today = 4
days = ''
for i, l in enumerate(LET):
    dot = 'wp_dot_on' if trained[i] else ('wp_dot_today' if i == today else 'wp_dot_off')
    days += f'''
    <LinearLayout android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:orientation="vertical" android:gravity="center_horizontal">
      <ImageView android:layout_width="16dp" android:layout_height="16dp" android:src="@drawable/{dot}" />
      {text(l, 10, 'wp_fg' if i == today else 'wp_muted', bold=i == today, extra='android:layout_marginTop="3dp"')}
    </LinearLayout>'''
w('layout/widget_preview_this_week.xml', card(f'''
  {text('This week', 12, 'wp_muted')}
  <LinearLayout android:layout_width="wrap_content" android:layout_height="wrap_content" android:orientation="horizontal" android:gravity="bottom">
    {text('3', 32, bold=True)}
    {text('of 4 workouts', 13, 'wp_muted', extra='android:layout_marginStart="6dp" android:layout_marginBottom="6dp"')}
  </LinearLayout>
  {vspacer()}
  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal">{days}
  </LinearLayout>
  {text('1 to go', 11, 'wp_muted', extra='android:layout_marginTop="6dp"')}'''))

# ---------- Next up ----------
w('layout/widget_preview_next_up.xml', card(f'''
  <LinearLayout android:layout_width="0dp" android:layout_height="match_parent" android:layout_weight="1" android:orientation="vertical">
    {text('Today', 12, 'wp_muted')}
    {text('Push A', 20, bold=True, extra='android:layout_marginTop="2dp"')}
    {text('Week 3 · 50 min', 12, 'wp_muted')}
    {vspacer()}
    {text('4-week streak · 3 of 4 sessions', 11, 'wp_muted')}
  </LinearLayout>
  <ImageView android:layout_width="1dp" android:layout_height="match_parent" android:src="@drawable/wp_divider" android:scaleType="fitXY" />
  <LinearLayout android:layout_width="wrap_content" android:layout_height="match_parent" android:orientation="vertical" android:paddingStart="14dp">
    {text('Volume', 12, 'wp_muted')}
    {text('20.3k kg', 20, bold=True)}
    {text('This week', 11, 'wp_muted')}
    {text('▲ 2.1k kg vs last', 12, 'wp_primary', bold=True, extra='android:layout_marginTop="8dp"')}
  </LinearLayout>''', orientation='horizontal', pad=16))

# ---------- Volume chart ----------
heights = [30, 0, 44, 0, 36, 22, 0]
bars = ''
for i, h in enumerate(heights):
    bg = 'wp_bar' if h else 'wp_bar_off'
    bars += f'''
    <LinearLayout android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:orientation="vertical" android:gravity="center_horizontal">
      <ImageView android:layout_width="12dp" android:layout_height="{max(3, h)}dp" android:src="@drawable/{bg}" android:scaleType="fitXY" />
      {text(LET[i], 9, 'wp_fg' if i == 6 else 'wp_muted', bold=i == 6, extra='android:layout_marginTop="3dp"')}
    </LinearLayout>'''
w('layout/widget_preview_volume_chart.xml', card(f'''
  {text('Volume', 12, 'wp_muted')}
  {text('36.9k kg', 22, bold=True)}
  {text('Last 7 days', 11, 'wp_muted')}
  {vspacer()}
  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal" android:gravity="bottom">{bars}
  </LinearLayout>'''))

# ---------- Month ----------
# Sample: a month starting on Thursday, 31 days, trained on a steady split.
lead, dim, trained_days, today_d = 3, 31, {1, 3, 5, 6, 8, 10, 12, 13, 15, 17, 19, 20, 22}, 23
cells = [''] * lead + [str(d) for d in range(1, dim + 1)]
while len(cells) % 7:
    cells.append('')
rows = ''
hdr = ''.join(f'''
      <TextView android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:gravity="center"
        android:text="{l}" android:textSize="8sp" android:textStyle="bold" android:textColor="@color/wp_muted" />''' for l in LET)
for r in range(0, len(cells), 7):
    row = ''
    for c in cells[r:r + 7]:
        on = c and int(c) in trained_days
        is_today = c and int(c) == today_d
        color = 'wp_on_primary' if on else ('wp_primary' if is_today else 'wp_fg')
        bg = ' android:background="@drawable/wp_dot_on"' if on else ''
        style = ' android:textStyle="bold"' if (on or is_today) else ''
        row += f'''
        <FrameLayout android:layout_width="0dp" android:layout_height="18dp" android:layout_weight="1">
          <TextView android:layout_width="18dp" android:layout_height="18dp" android:layout_gravity="center" android:gravity="center"{bg}
            android:text="{c}" android:textSize="9sp" android:textColor="@color/{color}"{style} />
        </FrameLayout>'''
    rows += f'''
    <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal" android:layout_marginTop="1dp">{row}
    </LinearLayout>'''


def stat(v, label, delta):
    return f'''
    <LinearLayout android:layout_width="wrap_content" android:layout_height="0dp" android:layout_weight="1" android:orientation="vertical" android:gravity="center_vertical">
      <LinearLayout android:layout_width="wrap_content" android:layout_height="wrap_content" android:orientation="horizontal" android:gravity="bottom">
        {text(v, 15, bold=True)}
        {text(delta, 10, 'wp_primary', bold=True, extra='android:layout_marginStart="5dp" android:layout_marginBottom="1dp"')}
      </LinearLayout>
      {text(label, 10, 'wp_muted')}
    </LinearLayout>'''


w('layout/widget_preview_month.xml', card(f'''
  <LinearLayout android:layout_width="0dp" android:layout_height="match_parent" android:layout_weight="1.25" android:orientation="vertical">
    {text('October', 15, bold=True, extra='android:layout_marginBottom="4dp"')}
    <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal">{hdr}
    </LinearLayout>{rows}
  </LinearLayout>
  <LinearLayout android:layout_width="0dp" android:layout_height="match_parent" android:layout_weight="1" android:orientation="vertical" android:paddingStart="14dp">
    {stat('13', 'Workouts', '▲ 4')}
    {stat('11h 20m', 'Duration', '▲ 2h 05m')}
    {stat('89.4k kg', 'Volume', '▲ 12.1k kg')}
  </LinearLayout>''', orientation='horizontal'))

# ---------- Routines ----------
names = ['Push A', 'Pull A', 'Legs', 'Upper', 'Full body', 'Arms']
grid = ''
for r in range(0, 6, 2):
    tiles = ''
    for i, n in enumerate(names[r:r + 2]):
        margin = ' android:layout_marginStart="8dp"' if i else ''
        tiles += f'''
      <FrameLayout android:layout_width="0dp" android:layout_height="52dp" android:layout_weight="1" android:background="@drawable/wp_tile"{margin}>
        <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:layout_gravity="center_vertical"
          android:layout_marginStart="12dp" android:text="{n}" android:textSize="13sp" android:textStyle="bold" android:textColor="@color/wp_fg" />
      </FrameLayout>'''
    top = ' android:layout_marginTop="8dp"' if r else ''
    grid += f'''
  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal"{top}>{tiles}
  </LinearLayout>'''
w('layout/widget_preview_routines.xml', card(f'''
  {text('Routines', 15, bold=True, extra='android:layout_marginBottom="8dp"')}{grid}'''))

print('ok')
