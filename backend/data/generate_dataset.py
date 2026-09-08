"""Generates a synthetic customer-support ticket dataset for intent classification.
Categories mirror common SaaS helpdesk intents so routing logic is realistic.
"""
import csv
import random

random.seed(42)

TEMPLATES = {
    "Billing": [
        "I was charged twice for my {plan} subscription this month",
        "Why is my invoice ${amount} higher than last month",
        "Can you explain the charge on my credit card ending {digits}",
        "I need a refund for the {plan} plan I cancelled",
        "My payment failed but you still charged my card",
        "Please send me a copy of last month's invoice",
        "I want to update my billing address and card details",
        "The discount code didn't apply to my {plan} purchase",
        "Do you offer annual billing instead of monthly",
        "I was billed after I already cancelled my account",
        "There's a duplicate transaction on my statement for {plan}",
        "Can I get a receipt for tax purposes for this invoice",
        "My card on file expired, how do I update payment info",
        "I upgraded to {plan} but I'm still being charged the old rate",
        "Why does my invoice include a charge I don't recognize",
    ],
    "Technical Issue": [
        "The app keeps crashing every time I open the {feature} page",
        "I'm getting a 500 error when I try to {action}",
        "The dashboard won't load, it's stuck on a spinner",
        "Uploads keep failing halfway through on {feature}",
        "I can't connect the {feature} integration, it times out",
        "The site is extremely slow when loading {feature}",
        "Getting a blank white screen after logging in",
        "The API is returning timeout errors on {action}",
        "Sync between devices stopped working for {feature}",
        "Notifications aren't showing up on my mobile app",
        "The page freezes whenever I try to open {feature}",
        "I keep getting logged out randomly while using {feature}",
        "The {feature} module throws an error every time I refresh",
        "Nothing happens when I click save on the {feature} screen",
        "The app is unresponsive after the latest update",
    ],
    "Account Access": [
        "I can't log in, it says my password is incorrect",
        "I'm locked out of my account after too many attempts",
        "The two-factor authentication code never arrives",
        "I forgot the email I used to sign up",
        "My account was suspended and I don't know why",
        "I need to reset my password but the reset link expired",
        "Someone else may have access to my account",
        "I can't verify my email address to activate my account",
        "My SSO login through Google isn't working anymore",
        "I need to transfer account ownership to a colleague",
        "It says my account doesn't exist but I've had it for years",
        "I can't get past the login screen on any device",
        "My session keeps expiring immediately after I sign in",
        "The magic link email for login never arrives",
        "I'm being asked to verify identity but the verification fails",
    ],
    "Feature Request": [
        "It would be great if you added dark mode to {feature}",
        "Can you build an export to Excel option for {feature}",
        "Please consider adding keyboard shortcuts for {action}",
        "I'd love a bulk edit option in {feature}",
        "Any plans to support {feature} on the mobile app",
        "Could you add a calendar view for {feature}",
        "It would help to have custom fields in {feature}",
        "Please add multi-language support for {feature}",
        "Can you integrate with Slack for {action} notifications",
        "A dark theme and font size settings would be nice",
        "Would you consider a public API for {feature}",
        "Please add the ability to duplicate items in {feature}",
        "It'd be useful to set reminders inside {feature}",
        "Can you support single sign-on for enterprise customers",
        "A recurring task option in {feature} would save us time",
    ],
    "Bug Report": [
        "The totals on {feature} don't match what I entered",
        "Filters on {feature} reset every time I refresh",
        "Dates are displaying one day off on {feature}",
        "Duplicate entries keep appearing after I {action}",
        "The chart on {feature} shows the wrong numbers",
        "Clicking save on {feature} doesn't actually save",
        "Search results are missing items that clearly exist",
        "The {feature} page shows a broken layout on Safari",
        "Export files from {feature} are corrupted",
        "Permissions aren't respected after I {action}",
        "The pagination on {feature} skips every other page",
        "Sorting by date on {feature} is completely out of order",
        "Uploaded files show the wrong file size on {feature}",
        "The confirmation email shows someone else's details",
        "Editing a record in {feature} silently deletes another field",
    ],
    "General Inquiry": [
        "What's the difference between the {plan} and enterprise plan",
        "Do you have documentation on how to {action}",
        "What are your support hours for {plan} customers",
        "Is there a mobile app available for {feature}",
        "How do I get started with {feature}",
        "What integrations do you support besides Slack",
        "Where can I find your API documentation",
        "Do you offer training sessions for new teams",
        "What happens to my data if I downgrade from {plan}",
        "Can I try the {plan} plan before purchasing",
        "How many users can I add on the {plan} plan",
        "Is there a discount for nonprofits or students",
        "Do you have a public status page for uptime",
        "What security certifications does your platform have",
        "Can I export my data if I switch providers later",
    ],
    "Cancellation": [
        "I want to cancel my {plan} subscription immediately",
        "How do I close my account permanently",
        "Please cancel my subscription and delete my data",
        "I no longer need the {plan} plan, cancel it please",
        "What's your cancellation policy for {plan}",
        "I tried to cancel but the button doesn't work",
        "Can I pause my subscription instead of cancelling",
        "I want to downgrade from {plan} and stop auto-renew",
        "Please confirm my cancellation was processed",
        "How do I cancel before the next billing cycle",
        "I'd like to cancel but keep my data for 30 days",
        "Is there an early termination fee for {plan}",
        "Cancel my renewal, I don't want to be charged again",
        "I need to shut down our whole team's {plan} account",
        "Please stop auto-renewal on my subscription right away",
    ],
    "Complaint": [
        "I'm extremely frustrated with the constant {feature} outages",
        "This is the third time I've contacted support about {action}",
        "Your support team never responded to my last ticket",
        "I'm very unhappy with how long this issue has taken",
        "The service quality has gotten worse over the last {digits} months",
        "I was promised a callback and never received one",
        "This bug has been open for weeks with no update",
        "I'm considering switching providers due to these issues",
        "Nobody explained why my account was charged incorrectly",
        "The support experience has been disappointing overall",
        "I've asked for a manager three times with no response",
        "This is unacceptable for a paying {plan} customer",
        "I'm shocked at how this issue was handled",
        "Your team keeps closing my ticket without fixing anything",
        "I regret upgrading to {plan}, the experience has been terrible",
    ],
}

FEATURES = ["billing", "reports", "dashboard", "integrations", "calendar", "inbox", "analytics", "settings"]
ACTIONS = ["export data", "invite teammates", "set up automation", "generate a report", "connect an integration", "update settings"]
PLANS = ["Pro", "Starter", "Enterprise", "Team", "Basic"]

def fill(t):
    return t.format(
        feature=random.choice(FEATURES),
        action=random.choice(ACTIONS),
        plan=random.choice(PLANS),
        amount=random.choice([12, 29, 49, 99, 149]),
        digits=random.choice(["1234", "5678", "9012", "3456"]),
    )

TYPO_PAIRS = [("teh", "the"), ("recieve", "receive"), ("cant", "can't"), ("wont", "won't")]

def add_noise(s):
    """Light augmentation so train/test aren't near-duplicates: casing, filler words, typos."""
    if random.random() < 0.25:
        s = s[0].lower() + s[1:]
    if random.random() < 0.2:
        s = random.choice(["Hi, ", "Hello, ", "Hey team, ", ""]) + s
    if random.random() < 0.15:
        s = s + random.choice([" please help", " thanks", " asap", "."])
    if random.random() < 0.1:
        s = s.replace("the", "teh", 1)
    return s

rows = []
template_id = 0
for label, templates in TEMPLATES.items():
    for t in templates:
        for _ in range(8):  # augment with slot-filled + noisy variations
            rows.append((add_noise(fill(t)), label, template_id))
        template_id += 1

random.shuffle(rows)

# Inject a small amount of realistic label noise (ambiguous/mislabeled tickets),
# which is typical of real annotated support datasets and keeps reported accuracy honest.
labels = list(TEMPLATES.keys())
noisy_rows = []
for text, label, tid in rows:
    if random.random() < 0.04:
        other = random.choice([l for l in labels if l != label])
        noisy_rows.append((text, other, tid))
    else:
        noisy_rows.append((text, label, tid))
rows = noisy_rows

from pathlib import Path
output_csv = Path(__file__).resolve().parent / "tickets_dataset.csv"
with open(output_csv, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["text", "label", "template_id"])
    w.writerows(rows)

print(f"Generated {len(rows)} rows across {len(TEMPLATES)} categories to {output_csv}")
