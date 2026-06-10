"""AsyncAnthropic streaming wrapper with deterministic offline fallback.

When ANTHROPIC_API_KEY is unset, a rich canned generator produces valid chapter
dicts that vary by world/theme/choice/chapter so the product works fully offline.
The offline engine is arc-based, animal-centric, and never repeats a sentence
across chapters of the same story.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, AsyncIterator

from app.core.config import settings
from app.core.logging import get_logger
from app.core.prompts import PROMPTS

log = get_logger(__name__)

# --------------------------------------------------------------------------
# World flavor + animal casts
# --------------------------------------------------------------------------

_WORLD_FLAVOR: dict[str, dict[str, str]] = {
    "forest": {
        "place": "the Whispering Woods",
        "smell": "the green scent of moss and warm pine",
        "sound": "leaves rustling like soft applause",
    },
    "ocean": {
        "place": "the Coral Kingdom",
        "smell": "salty sea spray and sweet kelp",
        "sound": "gentle waves humming an ancient tune",
    },
    "space": {
        "place": "the Starlight Galaxy",
        "smell": "cool stardust and minty comet trails",
        "sound": "planets chiming like distant bells",
    },
    "city": {
        "place": "the City of Bright Bridges",
        "smell": "fresh bread and rain on warm stone",
        "sound": "friendly bicycle bells and laughter",
    },
}

# Each world's animal cast. (key, friendly name, vivid trait).
_ANIMAL_CAST: dict[str, list[tuple[str, str, str]]] = {
    "forest": [
        ("fox", "Rusty the fox", "with a bushy tail that swished like a flame"),
        ("owl", "Pim the owl", "whose round eyes glowed like little moons"),
        ("rabbit", "Clover the rabbit", "who hopped in happy little zigzags"),
        ("deer", "Fern the deer", "stepping softly on tip-toe hooves"),
        ("hedgehog", "Pip the hedgehog", "rolled into a cozy, prickly ball"),
    ],
    "ocean": [
        ("dolphin", "Splash the dolphin", "who somersaulted through the foam"),
        ("turtle", "Shelly the sea-turtle", "gliding slow and wise as a cloud"),
        ("whale", "Boom the whale", "whose song rumbled like gentle thunder"),
        ("crab", "Pinch the crab", "who scuttled sideways with a click-click"),
        ("seahorse", "Curly the seahorse", "bobbing on the current like a tiny kite"),
    ],
    "space": [
        ("bunny", "Luma the space-bunny", "who left a trail of twinkling dust"),
        ("robotdog", "Bolt the robot-dog", "with ears that beeped a happy tune"),
        ("starfox", "Nova the star-fox", "whose fur shimmered with starlight"),
        ("cometcat", "Ziggy the comet-cat", "riding a tail of silver sparks"),
    ],
    "city": [
        ("cat", "Mango the cat", "who knew every shortcut in town"),
        ("puppy", "Biscuit the puppy", "with a wagging tail and muddy paws"),
        ("pigeon", "Coo the pigeon", "who delivered tiny rolled-up notes"),
        ("mouse", "Nibbles the mouse", "scampering along the warm cobblestones"),
    ],
}

_THEME_LESSON: dict[str, str] = {
    "friendship": "that the best adventures are shared with friends",
    "courage": "that being brave means trying even when you feel small",
    "mystery": "that wonderful secrets reward a curious heart",
    "adventure": "that every door opens to something amazing",
}

_MOOD_CYCLE: list[str] = ["wonder", "excitement", "mystery", "joy", "calm"]

_VOCAB_BANK: dict[str, list[tuple[str, str]]] = {
    "forest": [
        ("canopy", "the leafy roof made by the tops of tall trees"),
        ("glade", "a small open space with grass inside a forest"),
        ("dappled", "covered with small spots of light and shadow"),
        ("burrow", "a cozy tunnel home an animal digs in the ground"),
        ("meadow", "a wide field full of grass and wildflowers"),
    ],
    "ocean": [
        ("current", "water in the sea that moves in one direction"),
        ("luminous", "giving off a soft, gentle light"),
        ("lagoon", "a calm pool of seawater near the shore"),
        ("reef", "a colorful ridge of coral where sea creatures live"),
        ("tide", "the daily rise and fall of the sea"),
    ],
    "space": [
        ("orbit", "the curved path one space object travels around another"),
        ("nebula", "a giant, colorful cloud of dust and gas in space"),
        ("gravity", "the invisible pull that keeps things from floating away"),
        ("crater", "a big bowl-shaped dent on a moon or planet"),
        ("galaxy", "a huge family of billions of stars swirling together"),
    ],
    "city": [
        ("bustling", "full of busy, happy activity"),
        ("ingenious", "very clever and full of good ideas"),
        ("mural", "a big, beautiful painting made on a wall"),
        ("alley", "a narrow little street tucked between buildings"),
        ("plaza", "a wide open square where people gather"),
    ],
}

# --------------------------------------------------------------------------
# Phrase pools (selected deterministically per chapter via a seeded index)
# --------------------------------------------------------------------------

# Honoring the child's last choice, varied each time. {choice}, {name}
_HONOR_TEMPLATES: list[str] = [
    'Taking your idea to heart — "{choice}" — {name} grinned and set off.',
    'Just like you said, "{choice}", so that is exactly what {name} decided to do.',
    '"{choice}," you whispered, and {name} nodded as if it were the wisest plan ever.',
    'Your words still sparkled in the air: "{choice}". {name} followed them happily.',
    'Because of what you chose — "{choice}" — a brand-new path opened up for {name}.',
    '{name} remembered your voice saying "{choice}", and felt braver right away.',
]

# Acknowledging a curiosity reflection. {feeling}, {name}
_FEELING_TEMPLATES: list[str] = [
    'You shared that you felt "{feeling}", and {name} felt that very same warm glow.',
    'Hearing how you felt — "{feeling}" — made {name} smile from ear to ear.',
    '"{feeling}," you said, and somehow the whole world seemed to listen.',
    'Your feeling, "{feeling}", floated into the story like a friendly little cloud.',
]

# Chapter-1 arrival openings. {archetype}, {name}, {place}
_ARRIVAL_OPENINGS: list[str] = [
    "Once upon a today, a {archetype} hero named {name} tiptoed into {place} for the very first time.",
    "The morning sparkled the day {name}, who was wonderfully {archetype}, arrived in {place}.",
    "With one curious step, {name} the {archetype} explorer crossed into {place}.",
    "It all began when {name}, brave and {archetype}, discovered the secret door to {place}.",
    "Long ago and only a moment from now, {name} the {archetype} dreamer wandered into {place}.",
]

# Middle / rising-action openings. {name}, {place}
_RISING_OPENINGS: list[str] = [
    "Deeper into {place} {name} wandered, where every corner held a surprise.",
    "The path through {place} curved and climbed, and {name} could not wait to see more.",
    "A new morning blushed over {place}, and {name} was ready for whatever came next.",
    "Around the next bend in {place}, something wonderful was waiting for {name}.",
    "Onward {name} went, and {place} seemed to lean in close, eager to share a secret.",
    "{name} skipped along a winding trail in {place}, humming a happy little tune.",
]

# Climax openings (ch 6-7). {name}, {place}
_CLIMAX_OPENINGS: list[str] = [
    "At last {name} reached the heart of {place}, where the biggest moment of all was about to begin.",
    "The whole of {place} seemed to hold its breath as {name} arrived at the great clearing.",
    "Everything {name} had learned in {place} came together now, in one shining, important moment.",
    "This was it — the day {place} had been waiting for, and {name} stood right at its center.",
]

# Sensory beats. {smell}, {sound}
_SENSORY_BEATS: list[str] = [
    "The air carried {smell}, and all around there was {sound}.",
    "Somewhere close by drifted {smell}, mixed with {sound}.",
    "A gentle breeze brought {smell}, while {sound} kept perfect time.",
    "Everything smelled of {smell}, and the world was full of {sound}.",
    "{name_holder}There was {sound}, and the lovely hint of {smell} everywhere.",
]

# Animal introductions. {animal}, {trait}, {name}
_ANIMAL_INTROS: list[str] = [
    "That was when {name} met {animal}, {trait}.",
    "Out of nowhere bounced {animal}, {trait}, ready to be friends.",
    "Waiting on the trail was {animal}, {trait}, with a wave hello.",
    "{name} heard a friendly noise — it was {animal}, {trait}!",
    "A new companion appeared: {animal}, {trait}, eyes bright with adventure.",
    "Peeking out to say hello came {animal}, {trait}.",
]

# Little discoveries / challenges. {animal}, {name}, {vocab}
_CHALLENGES: list[str] = [
    "Together they found a wobbly bridge of {vocab}, and {animal} showed {name} just how to cross it.",
    "A playful riddle was carved into the {vocab}, and {name} and {animal} giggled as they solved it.",
    "{animal} had lost a shiny pebble, so {name} helped search beside the {vocab} until it sparkled into view.",
    "A gentle puzzle of stepping-stones led toward the {vocab}, and the two friends hopped across one by one.",
    "{name} and {animal} built a tiny raft to reach the {vocab}, laughing the whole way.",
    "They followed a trail of glittering clues that danced toward the {vocab}.",
]

# Transitions toward the chapter end. {name}, {animal}
_TRANSITIONS: list[str] = [
    "With hearts full of wonder, {name} and {animal} paused to catch their breath.",
    "Hand in paw, {name} and {animal} looked at the road ahead.",
    "Feeling braver than ever, {name} squeezed {animal}'s paw.",
    "{name} and {animal} shared a happy, knowing smile.",
    "A warm glow of friendship wrapped around {name} and {animal}.",
]

# Cliffhangers (for older tiers). {name}, {animal}
_CLIFFHANGERS: list[str] = [
    "Then a soft golden light flickered between the trees — what could be making it shine?",
    "Suddenly a tiny map fluttered down from above, marked with a single curious X.",
    "Just then {animal} pointed a paw at three glittering doorways, each humming a different song.",
    "A friendly voice called {name}'s name from somewhere up ahead — but who could it be?",
    "All at once the ground began to sparkle, spelling out a secret only {name} could read.",
    "A door of woven light appeared, and behind it something wonderful waited to be found.",
    "{animal} discovered a chest that hummed and glowed — should they open it now or wait?",
]

# Soft "what's next" wonder (for youngest tiers). {name}, {animal}
_SOFT_WONDERS: list[str] = [
    "And {name} wondered, with a sleepy smile, what lovely thing might come next.",
    "What sweet surprise waited tomorrow? Even {animal} could only dream.",
    "Snuggled close, {name} and {animal} wondered what gentle wonder lay ahead.",
    "The day grew soft and warm, and {name} smiled to think of more fun to come.",
]

# Layered reflective beats for the oldest tier (11-12). {name}, {lesson}
_LAYERED_BEATS: list[str] = [
    "Deep down, {name} sensed that the choice ahead mattered — for kindness, once given, has a way of finding its way home.",
    "There was a quiet truth in the moment, the kind that teaches {lesson} without ever needing to say it aloud.",
    "{name} weighed the decision carefully, knowing that the bravest paths are rarely the easiest ones.",
    "Some things, {name} realized, are worth waiting and wondering about — and this was surely one of them.",
]

# Climax payoff lines. {name}, {animal}, {lesson}
_CLIMAX_PAYOFFS: list[str] = [
    "And there, all together, {name} and {animal} discovered {lesson}.",
    "In that shining moment {name} learned {lesson}, and {animal} cheered.",
    "The secret was wonderful and true: {lesson}. {name} and {animal} hugged with joy.",
]

# Choice sets — pools per arc stage. Each entry is a list of 3 choices.
# {animal}, {place}, {vocab}
_CHOICE_SETS_EARLY: list[list[str]] = [
    [
        "Race {animal} to the top of the nearest hill",
        "Stop and sketch a map of {place}",
        "Share a snack with a shy new creature",
    ],
    [
        "Build a cozy fort with {animal}",
        "Follow the sparkling {vocab} a little farther",
        "Sing a song to greet the morning",
    ],
    [
        "Explore the giggling stream nearby",
        "Teach {animal} a fun new game",
        "Collect smooth, shiny pebbles for later",
    ],
]
_CHOICE_SETS_MID: list[list[str]] = [
    [
        "Cross the wobbly bridge with {animal}",
        "Solve the riddle hidden in the {vocab}",
        "Take the secret tunnel under {place}",
    ],
    [
        "Help {animal} fix the tiny broken raft",
        "Climb higher for a better view",
        "Whisper hello to the friendly echo",
    ],
    [
        "Light a lantern and explore the cave",
        "Decode the glittering clues with {animal}",
        "Follow the trail of musical bells",
    ],
]
_CHOICE_SETS_LATE: list[list[str]] = [
    [
        "Open the glowing doorway together",
        "Call all the animal friends to help",
        "Follow {animal} toward the great light",
    ],
    [
        "Step bravely into the shining clearing",
        "Read the secret message in the {vocab}",
        "Hold hands and make a wish with {animal}",
    ],
    [
        "Unlock the humming treasure chest",
        "Climb to the very heart of {place}",
        "Trust {animal} and leap into the adventure",
    ],
]

# Title fragments. {vocab}, {animal_word}
_TITLE_PATTERNS: list[str] = [
    "The {vocab_title} Adventure",
    "{animal_title} and the {vocab_title}",
    "A Secret in the {vocab_title}",
    "The Day of the {animal_title}",
    "Wonders of the {vocab_title}",
    "{animal_title}'s Brave Idea",
    "The {vocab_title} Surprise",
    "Friends Beyond the {vocab_title}",
]


# --------------------------------------------------------------------------
# Age tiers
# --------------------------------------------------------------------------

def age_tier(age: int) -> str:
    """Map a numeric age to a content tier label."""
    if age <= 2:
        return "0-2"
    if age <= 4:
        return "3-4"
    if age <= 7:
        return "5-7"
    if age <= 10:
        return "8-10"
    return "11-12"


# Per-tier knobs: paragraph count, vocab count, and whether to use a soft
# wonder instead of a sharper cliffhanger.
_TIER_CONFIG: dict[str, dict[str, Any]] = {
    "0-2": {"paragraphs": 1, "vocab": 0, "soft": True},
    "3-4": {"paragraphs": 1, "vocab": 1, "soft": True},
    "5-7": {"paragraphs": 2, "vocab": 1, "soft": False},
    "8-10": {"paragraphs": 3, "vocab": 2, "soft": False},
    "11-12": {"paragraphs": 3, "vocab": 3, "soft": False},
}


# --------------------------------------------------------------------------
# Deterministic selection helpers
# --------------------------------------------------------------------------

def _seed(*parts: Any) -> int:
    """Stable integer seed from the given parts (reproducible across runs)."""
    raw = "|".join(str(p) for p in parts)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return int(digest[:12], 16)


def _pick(pool: list[Any], seed: int, salt: int = 0) -> Any:
    """Deterministically choose one element from a pool."""
    return pool[(seed + salt) % len(pool)]


def _pick_distinct(pool: list[Any], story_seed: int, salt: int, index: int) -> Any:
    """Pick from a deterministic per-story permutation, indexed by `index`.

    This guarantees that consecutive picks (e.g. one per chapter) never repeat
    until the pool is exhausted, while staying reproducible per story.
    """
    n = len(pool)
    order = list(range(n))
    # Fisher-Yates shuffle driven by a story-stable hash stream.
    for i in range(n - 1, 0, -1):
        j = _seed(story_seed, salt, i) % (i + 1)
        order[i], order[j] = order[j], order[i]
    return pool[order[index % n]]


def _canned_chapter(
    *,
    chapter_number: int,
    character_name: str,
    character_archetype: str,
    world: str,
    theme: str,
    age: int,
    last_choice: str | None,
    curiosity_answer: str | None,
) -> dict[str, Any]:
    """Produce a deterministic, varied, arc-based chapter dict for offline mode."""
    flavor = _WORLD_FLAVOR.get(world, _WORLD_FLAVOR["forest"])
    lesson = _THEME_LESSON.get(theme, _THEME_LESSON["adventure"])
    vocab_pool = _VOCAB_BANK.get(world, _VOCAB_BANK["forest"])
    animals = _ANIMAL_CAST.get(world, _ANIMAL_CAST["forest"])

    tier = age_tier(age)
    cfg = _TIER_CONFIG[tier]
    name = character_name

    mood = _MOOD_CYCLE[(chapter_number - 1) % len(_MOOD_CYCLE)]

    # Base seed varies per (story identity, chapter) so phrasing differs per
    # chapter and per story, yet is fully reproducible.
    base = _seed(character_name, world, theme, chapter_number)
    # Story seed is stable across chapters; used with _pick_distinct so that
    # per-chapter picks (openings, cliffhangers, choices) never repeat within
    # a story until the pool is exhausted.
    story_seed = _seed(character_name, world, theme)
    ci = chapter_number - 1  # zero-based chapter index for distinct picks

    # Pick this chapter's animal + vocab word (cycle so each chapter differs).
    animal_key, animal_name, animal_trait = animals[(chapter_number - 1) % len(animals)]
    vocab_word, vocab_def = vocab_pool[(chapter_number - 1) % len(vocab_pool)]

    # --- Arc stage ---------------------------------------------------------
    if chapter_number == 1:
        stage = "arrival"
    elif chapter_number >= 6:
        stage = "climax"
    else:
        stage = "rising"

    # --- Opening line ------------------------------------------------------
    if stage == "arrival":
        opening = _pick(_ARRIVAL_OPENINGS, base, 1).format(
            archetype=character_archetype, name=name, place=flavor["place"]
        )
    elif stage == "climax":
        # ch6 -> index 0, ch7 -> index 1 within the climax pool.
        opening = _pick_distinct(
            _CLIMAX_OPENINGS, story_seed, 101, chapter_number - 6
        ).format(name=name, place=flavor["place"])
    else:
        # Distinct per rising chapter (chapters 2..5).
        opening = _pick_distinct(
            _RISING_OPENINGS, story_seed, 102, chapter_number - 2
        ).format(name=name, place=flavor["place"])

    # --- Woven child input -------------------------------------------------
    woven_parts: list[str] = []
    if last_choice:
        woven_parts.append(
            _pick(_HONOR_TEMPLATES, base, 2).format(choice=last_choice.strip(), name=name)
        )
    if curiosity_answer:
        woven_parts.append(
            _pick(_FEELING_TEMPLATES, base, 3).format(
                feeling=curiosity_answer.strip(), name=name
            )
        )
    woven = (" " + " ".join(woven_parts)) if woven_parts else ""

    # --- Sensory beat ------------------------------------------------------
    sensory = _pick(_SENSORY_BEATS, base, 4).format(
        smell=flavor["smell"], sound=flavor["sound"], name_holder=""
    )

    # --- Animal intro + activity ------------------------------------------
    intro = _pick(_ANIMAL_INTROS, base, 5).format(
        animal=animal_name, trait=animal_trait, name=name
    )
    challenge = _pick(_CHALLENGES, base, 6).format(
        animal=animal_name, name=name, vocab=vocab_word
    )
    transition = _pick(_TRANSITIONS, base, 7).format(name=name, animal=animal_name)

    # --- Ending (cliffhanger / soft wonder / climax payoff) ----------------
    if stage == "climax":
        ending = _pick(_CLIMAX_PAYOFFS, base, 8).format(
            name=name, animal=animal_name, lesson=lesson
        )
    elif cfg["soft"]:
        ending = _pick_distinct(_SOFT_WONDERS, story_seed, 103, ci).format(
            name=name, animal=animal_name
        )
    else:
        # Distinct per chapter so no two chapters share a cliffhanger.
        ending = _pick_distinct(_CLIFFHANGERS, story_seed, 104, ci).format(
            name=name, animal=animal_name
        )

    # --- Assemble body, scaled by tier ------------------------------------
    paragraphs = cfg["paragraphs"]
    if paragraphs <= 1:
        # Youngest tiers: very short and soothing.
        if tier == "0-2":
            # 1-2 simple sentences with gentle repetition.
            body = (
                f"{name} met {animal_name}. "
                f"{name} and {animal_name} smiled, smiled, smiled. "
                f"{ending}"
            )
        else:
            body = f"{opening}{woven} {intro} {ending}"
    elif paragraphs == 2:
        para1 = f"{opening} {sensory}{woven}"
        para2 = f"{intro} {challenge} {transition} {ending}"
        body = f"{para1}\n\n{para2}"
    else:
        para1 = f"{opening} {sensory}{woven}"
        para2 = f"{intro} {challenge}"
        # The oldest tier gets a layered, reflective sentence for depth.
        if tier == "11-12":
            layered = _pick(_LAYERED_BEATS, base, 14).format(name=name, lesson=lesson)
            para3 = f"{transition} {layered} {ending}"
        else:
            para3 = f"{transition} {ending}"
        body = f"{para1}\n\n{para2}\n\n{para3}"

    # --- Choices (arc-appropriate, varied) --------------------------------
    if stage == "arrival" or stage == "rising" and chapter_number <= 3:
        choice_pool = _CHOICE_SETS_EARLY
    elif stage == "climax":
        choice_pool = _CHOICE_SETS_LATE
    else:
        choice_pool = _CHOICE_SETS_MID
    chosen_set = _pick_distinct(choice_pool, story_seed, 105, ci)
    choices = [
        c.format(animal=animal_name, place=flavor["place"], vocab=vocab_word)
        for c in chosen_set
    ]

    # --- Title -------------------------------------------------------------
    title_frag = _pick(_TITLE_PATTERNS, base, 12).format(
        vocab_title=vocab_word.title(),
        animal_title=animal_name.split()[0],
    )
    chapter_title = f"Chapter {chapter_number}: {title_frag}"

    # --- Vocabulary, scaled by tier ---------------------------------------
    new_vocab: list[str] = []
    n_vocab = cfg["vocab"]
    if n_vocab > 0:
        for i in range(n_vocab):
            w = vocab_pool[(chapter_number - 1 + i) % len(vocab_pool)][0]
            if w not in new_vocab:
                new_vocab.append(w)

    # --- Scene description (names the animal for illustration selection) ---
    scene_actions = [
        "exploring together",
        "discovering a hidden wonder",
        "crossing a sparkling path",
        "sharing a happy moment",
        "setting off on a new adventure",
    ]
    action = _pick(scene_actions, base, 13)
    scene_description = (
        f"{name} and {animal_name} {action} in {flavor['place']}"
    )

    return {
        "chapter_number": chapter_number,
        "chapter_title": chapter_title,
        "chapter_text": body,
        "choices": choices,
        "scene_description": scene_description,
        "mood": mood,
        "new_vocabulary": new_vocab,
    }


def _split_sentences(text: str) -> list[str]:
    """Naive sentence splitter that keeps terminal punctuation."""
    import re

    parts = re.split(r"(?<=[.!?])\s+", text.replace("\n", " ").strip())
    return [p.strip() for p in parts if p.strip()]


class ClaudeService:
    """Streaming Anthropic wrapper with offline canned generation."""

    def __init__(self) -> None:
        self._client: Any | None = None
        if settings.has_anthropic:
            try:
                from anthropic import AsyncAnthropic

                self._client = AsyncAnthropic(api_key=settings.anthropic_api_key)
                log.info("claude_client_ready", model=settings.claude_model)
            except Exception as exc:  # noqa: BLE001
                log.warning("claude_client_init_failed", error=str(exc))
                self._client = None
        if self._client is None:
            log.info("claude_offline_mode")

    @property
    def online(self) -> bool:
        return self._client is not None

    async def generate_chapter(
        self,
        *,
        chapter_number: int,
        character_name: str,
        character_archetype: str,
        world: str,
        theme: str,
        age: int,
        last_choice: str | None = None,
        curiosity_answer: str | None = None,
    ) -> dict[str, Any]:
        """Return a parsed chapter dict (text, title, choices, etc.)."""
        if self._client is None:
            return _canned_chapter(
                chapter_number=chapter_number,
                character_name=character_name,
                character_archetype=character_archetype,
                world=world,
                theme=theme,
                age=age,
                last_choice=last_choice,
                curiosity_answer=curiosity_answer,
            )

        user_lines = [
            f"Child age: {age} (content tier {age_tier(age)}).",
            f"Hero: {character_name}, who is {character_archetype}.",
            f"World: {world}. Theme: {theme}.",
            f"This is chapter {chapter_number} (max 8 chapters).",
        ]
        if last_choice:
            user_lines.append(f'The child just chose / said: "{last_choice}".')
        if curiosity_answer:
            user_lines.append(
                f'The child reflected: "{curiosity_answer}". Honor this feeling.'
            )
        user_lines.append(
            "Write the next chapter. Respond with ONLY a JSON object matching the "
            "required output format."
        )
        user_prompt = "\n".join(user_lines)

        try:
            text_parts: list[str] = []
            async with self._client.messages.stream(
                model=settings.claude_model,
                max_tokens=1500,
                system=PROMPTS.story_system,
                messages=[{"role": "user", "content": user_prompt}],
            ) as stream:
                async for chunk in stream.text_stream:
                    text_parts.append(chunk)
            raw = "".join(text_parts)
            data = _extract_json(raw)
            data["chapter_number"] = chapter_number
            data.setdefault("mood", _MOOD_CYCLE[(chapter_number - 1) % 5])
            data.setdefault("new_vocabulary", [])
            data.setdefault("choices", [])
            return data
        except Exception as exc:  # noqa: BLE001 - never crash the request path
            log.warning("claude_generation_failed_fallback", error=str(exc))
            return _canned_chapter(
                chapter_number=chapter_number,
                character_name=character_name,
                character_archetype=character_archetype,
                world=world,
                theme=theme,
                age=age,
                last_choice=last_choice,
                curiosity_answer=curiosity_answer,
            )

    async def stream_text(
        self, prompt: str, system: str, max_tokens: int = 400
    ) -> AsyncIterator[str]:
        """Stream raw text chunks for a one-off prompt (curiosity/vocab)."""
        if self._client is None:
            yield ""
            return
        async with self._client.messages.stream(
            model=settings.claude_model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            async for chunk in stream.text_stream:
                yield chunk

    async def complete(self, prompt: str, system: str, max_tokens: int = 400) -> str:
        """Return a full completion string, or empty string offline/on error."""
        if self._client is None:
            return ""
        try:
            parts: list[str] = []
            async for chunk in self.stream_text(prompt, system, max_tokens=max_tokens):
                parts.append(chunk)
            return "".join(parts).strip()
        except Exception as exc:  # noqa: BLE001
            log.warning("claude_complete_failed", error=str(exc))
            return ""


def _extract_json(raw: str) -> dict[str, Any]:
    """Extract the first JSON object from a model response."""
    raw = raw.strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("no JSON object found in response")
    return json.loads(raw[start : end + 1])


# Re-export the sentence splitter for the stream endpoint.
split_sentences = _split_sentences

claude_service = ClaudeService()
