from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1280, 820
SIDEBAR_W = 220
LIST_W = 300

# Colors
BG      = (28, 28, 30)
BG2     = (44, 44, 46)
BG3     = (58, 58, 60)
BORDER  = (255, 255, 255, 20)
TEXT    = (245, 245, 247)
TEXT2   = (174, 174, 178)
TEXT3   = (99,  99,  102)
ACCENT  = (10,  132, 255)
DANGER  = (255, 69,  58)
GREEN   = (48,  209, 88)
WHITE   = (255, 255, 255)
SEL_BG  = ACCENT

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

# ── Font helpers ──────────────────────────────────────────────────────────────
def font(size, bold=False):
    paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

F_SM   = font(11)
F_BODY = font(13)
F_BOLD = font(13, bold=True)
F_H1   = font(18, bold=True)
F_H2   = font(15, bold=True)
F_SUBJ = font(17, bold=True)
F_TINY = font(10)

def text(x, y, s, f, fill, anchor="la"):
    d.text((x, y), s, font=f, fill=fill, anchor=anchor)

def clip_text(txt, f, max_w):
    if d.textlength(txt, font=f) <= max_w:
        return txt
    while len(txt) > 1 and d.textlength(txt + "…", font=f) > max_w:
        txt = txt[:-1]
    return txt + "…"

def rect(x0, y0, x1, y1, fill, radius=0):
    if radius:
        d.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill)
    else:
        d.rectangle([x0, y0, x1, y1], fill=fill)

def hline(y, x0, x1, color=(255, 255, 255, 18)):
    d.line([(x0, y), (x1, y)], fill=color[:3], width=1)

def circle(cx, cy, r, fill):
    d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=fill)

# ── Traffic lights ────────────────────────────────────────────────────────────
circle(14, 15, 6, (255, 95,  87))
circle(30, 15, 6, (254, 188, 46))
circle(46, 15, 6, (40,  200, 64))

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SIDEBAR
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
rect(0, 0, SIDEBAR_W, H, (30, 30, 32))
hline(0, 0, SIDEBAR_W, (255, 255, 255, 0))  # reset
d.line([(SIDEBAR_W, 0), (SIDEBAR_W, H)], fill=(60, 60, 62), width=1)

text(16, 38, "MailApp", F_H2, TEXT)

# Compose button
rect(SIDEBAR_W - 38, 32, SIDEBAR_W - 10, 50, ACCENT, radius=10)
text(SIDEBAR_W - 24, 41, "✏", F_SM, WHITE, anchor="mm")

# Accounts section
text(16, 70, "ACCOUNTS", F_TINY, TEXT3)
d.line([(16, 68), (SIDEBAR_W - 16, 68)], fill=(60,60,62))

# Active account
rect(8, 80, SIDEBAR_W - 8, 100, ACCENT, radius=7)
circle(22, 90, 4, WHITE)
text(32, 90, "Alex Johnson", F_BODY, WHITE, anchor="lm")

# Second account
circle(22, 112, 4, GREEN)
text(32, 112, "Work Account", F_BODY, TEXT3, anchor="lm")

# Folders
text(16, 136, "FOLDERS", F_TINY, TEXT3)
d.line([(16, 134), (SIDEBAR_W - 16, 134)], fill=(60,60,62))

folders = [
    ("📥", "Inbox",  True),
    ("📤", "Sent",   False),
    ("📝", "Drafts", False),
    ("⚠",  "Spam",   False),
    ("🗑",  "Trash",  False),
]
fy = 144
for icon, name, active in folders:
    if active:
        rect(8, fy, SIDEBAR_W - 8, fy + 22, ACCENT, radius=6)
        text(28, fy + 11, name, F_BODY, WHITE, anchor="lm")
    else:
        text(28, fy + 11, name, F_BODY, TEXT3, anchor="lm")
    fy += 26

# Settings gear at bottom
text(SIDEBAR_W - 20, H - 20, "⚙", F_BODY, TEXT3, anchor="mm")
d.line([(8, H - 36), (SIDEBAR_W - 8, H - 36)], fill=(60,60,62))

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# EMAIL LIST PANEL
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LX = SIDEBAR_W
rect(LX, 0, LX + LIST_W, H, BG2)
d.line([(LX + LIST_W, 0), (LX + LIST_W, H)], fill=(60, 60, 62), width=1)

text(LX + 14, 38, "Inbox", F_H1, TEXT)
# Search bar
rect(LX + 10, 58, LX + LIST_W - 10, 76, BG3, radius=8)
text(LX + 22, 67, "🔍 Search…", F_SM, TEXT3, anchor="lm")

emails = [
    ("Sarah Chen",    "Re: Q1 Design Review — slides attached", "Hey! I've updated the deck…", "10:42 AM", True,  True),
    ("GitHub",        "[anthropics/claude-code] PR #482",        "A pull request was opened…",  "9:15 AM",  True,  False),
    ("Liam Park",     "Lunch on Thursday?",                      "Are you free around noon?…",  "Yesterday",False, False),
    ("Notion",        "Your weekly digest is ready",             "5 pages updated · 2 DB…",     "Yesterday",False, False),
    ("Maya Rodriguez","Contract draft — please review",          "Attached is the revised…",    "Mon",      True,  False),
    ("Stripe",        "Your March invoice is available",         "Invoice #INV-2026-0319…",     "Mon",      False, False),
    ("Jordan Kim",    "Great catch on the API bug!",             "Thanks for flagging that…",   "Sun",      False, False),
    ("Vercel",        "Deployment: main → production",           "site-dashboard deployed 34s", "Sun",      False, False),
]

ey = 82
EH = 58
for (sender, subj, prev, date, unread, selected) in emails:
    ex0, ex1 = LX, LX + LIST_W
    if selected:
        rect(ex0, ey, ex1, ey + EH, ACCENT)
        tc, tc2, tc3 = WHITE, (220,235,255), (180,210,255)
    elif ey > 82 and (ey // EH) % 2 == 0:
        rect(ex0, ey, ex1, ey + EH, (40, 40, 42))
        tc, tc2, tc3 = TEXT, TEXT2, TEXT3
    else:
        tc, tc2, tc3 = TEXT, TEXT2, TEXT3

    d.line([(ex0, ey + EH), (ex1, ey + EH)], fill=(55,55,57))

    if unread:
        dot_color = WHITE if selected else ACCENT
        circle(LX + 8, ey + 18, 3, dot_color)

    fw = LIST_W - 70
    text(LX + 16, ey + 10, clip_text(sender, F_BOLD, fw), F_BOLD if unread else F_BODY, tc)
    text(LX + 16, ey + 26, clip_text(subj, F_BODY, fw), F_BODY, tc2)
    text(LX + 16, ey + 41, clip_text(prev, F_SM, fw), F_SM, tc3)
    text(LX + LIST_W - 10, ey + 10, date, F_TINY, tc3 if not selected else (200,225,255), anchor="ra")

    ey += EH

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# EMAIL READER
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RX = SIDEBAR_W + LIST_W
rect(RX, 0, W, H, BG)

# Toolbar
d.line([(RX, 56), (W, 56)], fill=(60,60,62))
btns = ["← Reply", "↩ Reply All", "→ Forward"]
bx = RX + 14
for label in btns:
    bw = int(d.textlength(label, font=F_BODY)) + 22
    rect(bx, 30, bx + bw, 50, BG2, radius=7)
    d.rounded_rectangle([bx, 30, bx + bw, 50], radius=7, outline=(60,60,62))
    text(bx + bw // 2, 40, label, F_BODY, TEXT2, anchor="mm")
    bx += bw + 8

# Delete btn (right)
dw = 34
rect(W - dw - 14, 30, W - 14, 50, BG2, radius=7)
d.rounded_rectangle([W - dw - 14, 30, W - 14, 50], radius=7, outline=(60,60,62))
text(W - 14 - dw//2, 40, "🗑", F_SM, TEXT3, anchor="mm")

# Sender avatar
circle(RX + 35, 90, 21, (40, 70, 120))
text(RX + 35, 90, "S", F_H2, WHITE, anchor="mm")

# Email headers
text(RX + 66, 68, "Re: Q1 Design Review — slides attached", F_SUBJ, TEXT)
text(RX + 66, 90, "Sarah Chen <sarah.chen@designco.io>", F_BODY, TEXT2)
text(RX + 66, 104, "To: alex@example.com", F_SM, TEXT3)
text(RX + 66, 116, "Thu, Mar 19, 2026 at 10:42 AM", F_SM, TEXT3)

d.line([(RX, 130), (W, 130)], fill=(60,60,62))

# Body
body_lines = [
    (F_BODY,  TEXT,  "Hey Alex!"),
    (F_SM,    TEXT3, ""),
    (F_BODY,  TEXT2, "I've updated the deck with all the feedback you left in the shared doc."),
    (F_BODY,  TEXT2, "The main changes are:"),
    (F_SM,    TEXT3, ""),
    (F_BODY,  TEXT2, "  •  Typography section — swapped Inter for the new variable font"),
    (F_BODY,  TEXT2, "  •  Color system slide — shows semantic token mapping"),
    (F_BODY,  TEXT2, "  •  Component inventory — added new card variants from last sprint"),
    (F_SM,    TEXT3, ""),
    (F_BODY,  TEXT2, "Can you take a look before the 3 PM call? Ping me if anything needs"),
    (F_BODY,  TEXT2, "another pass."),
    (F_SM,    TEXT3, ""),
    (F_BODY,  TEXT,  "Thanks!"),
    (F_BOLD,  TEXT,  "Sarah"),
]

by = 146
for (f, col, line) in body_lines:
    text(RX + 24, by, line, f, col)
    by += 20

# Quoted text
d.line([(RX + 24, by + 8), (RX + 27, by + 68)], fill=(70,70,72), width=3)
quote_lines = [
    "On Wed, Mar 18, 2026 at 4:31 PM, Alex Johnson wrote:",
    "> Sarah — the deck looks great overall. One thing worth revisiting",
    "> is the typography section. The font size ramp feels compressed.",
]
qy = by + 12
for ql in quote_lines:
    text(RX + 34, qy, ql, F_SM, TEXT3)
    qy += 18

# ── Border/shadow overlay ─────────────────────────────────────────────────────
border_img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
bd = ImageDraw.Draw(border_img)
bd.rounded_rectangle([0, 0, W-1, H-1], radius=12, outline=(255, 255, 255, 40), width=1)
img.paste(border_img, mask=border_img)

out = "/home/user/Site-/mailapp-preview.png"
img.save(out, "PNG", optimize=True)
print(f"Saved: {out}  ({W}x{H})")
