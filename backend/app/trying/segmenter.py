import re
from typing import List, Dict, Any

# Keywords that suggest administrative delegation or constraints
DELEGATION_KEYWORDS = [
    r"\bsec\b",
    r"\bsecretary\b",
    r"\bboard\b",
    r"\bcommission\b",
    r"\badministrator\b",
    r"\bauthority\b",
    r"\bauthorize\b",
    r"\bauthorized\b",
    r"\bprescribe\b",
    r"\bregulation\b",
    r"\brules?\b",
    r"\bshall\b",
    r"\bexempt\b",
    r"\breport\b",
    r"\blimit\b"
]

DELEGATION_PATTERN = re.compile("|".join(DELEGATION_KEYWORDS), re.IGNORECASE)


def split_into_sections(text: str) -> List[Dict[str, Any]]:
    """Splits a statutory text file into section-level dicts."""
    # Pattern to match SEC. or Section followed by numbers
    pattern = re.compile(
        r"(?=(\bSEC\.\s+\d+|\bSection\s+\d+|\bTITLE\s+[IVXLCDM]+\b|\bPublic Law\s+\d+-\d+\b))",
        re.IGNORECASE
    )
    
    parts = pattern.split(text)
    sections = []
    
    current_title = "Intro"
    
    i = 0
    # The first element is before any section marker (Intro)
    if parts and not pattern.match(parts[0]):
        intro_text = parts[0].strip()
        if intro_text:
            sections.append({
                "header": "Intro",
                "content": intro_text,
                "word_count": len(intro_text.split())
            })
        i = 1
        
    while i < len(parts):
        header = parts[i].strip()
        content = parts[i+1].strip() if i+1 < len(parts) else ""
        
        # Clean up double headers
        if content.startswith(header):
            content = content[len(header):].strip()
            
        full_section_text = f"{header} {content}"
        
        sections.append({
            "header": header,
            "content": full_section_text,
            "word_count": len(full_section_text.split())
        })
        i += 2
        
    return sections


def screen_active_sections(sections: List[Dict[str, Any]], max_chars: int = 60000) -> str:
    """Filter out boilerplate sections that have zero delegation context.
    
    If the text fits in max_chars, return it all. Otherwise, select the most relevant sections.
    """
    total_text = "\n\n".join(sec["content"] for sec in sections)
    if len(total_text) <= max_chars:
        return total_text
        
    # If the document is too big, score and rank sections by keyword presence
    scored_sections = []
    for sec in sections:
        content = sec["content"]
        # Basic count of keyword hits
        score = len(DELEGATION_PATTERN.findall(content))
        scored_sections.append((score, sec))
        
    # Always preserve the "Intro" section
    intro_sec = next((sec for score, sec in scored_sections if sec["header"] == "Intro"), None)
    
    # Sort others by score descending
    other_sections = [(score, sec) for score, sec in scored_sections if sec["header"] != "Intro"]
    other_sections.sort(key=lambda x: x[0], reverse=True) # Sort by score
    
    selected = []
    if intro_sec:
        selected.append(intro_sec)
        
    current_length = sum(len(s["content"]) for s in selected)
    
    for score, sec in other_sections:
        sec_len = len(sec["content"])
        if current_length + sec_len + 2 > max_chars:
            # Skip if it exceeds the context budget
            continue
        selected.append(sec)
        current_length += sec_len + 2

        
    # Re-sort selected sections by their original order (implied by header or index)
    # To keep simple, we can just sort by original order in the list
    order_map = {sec["header"]: idx for idx, sec in enumerate(sections)}
    selected.sort(key=lambda x: order_map.get(x["header"], 9999))
    
    return "\n\n".join(sec["content"] for sec in selected)
