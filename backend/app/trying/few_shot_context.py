import json

FEW_SHOT_EXEMPLARS = [

    {
        "law_id": "83-577",
        "description": "PL 83-577 (1954): Amendment to the Securities Exchange Act of 1934 (S2846).",
        "inputs": {
            "text": "An Act to amend the Securities Exchange Act of 1934 to simplify the registration of issues with the SEC and improve pre-sale dissemination of information... [Simplified registration provisions to facilitate distribution of securities prior to the effective date of a registration statement]."
        },
        "outputs": {
            "DelegateLaw": "N",
            "Delegees": "None",
            "NewAgencyCreated": "N",
            "ApptPower": "N",
            "ApptComment": "Not mentioned",
            "TimeLimits": "N",
            "TimeComment": "Not mentioned",
            "SpendLimits": "N",
            "SpendingComment": "Not mentioned",
            "LegAxnReq": "N",
            "LegAxnComment": "Not mentioned",
            "ExecAxnReq": "N",
            "ExecAxnComment": "Not mentioned",
            "LegVeto": "N",
            "VetoComment": "Not mentioned",
            "ReportReq": "N",
            "ReportComment": "Not mentioned",
            "Consultation": "N",
            "ConsultComment": "Not mentioned",
            "PubHearings": "N",
            "HearingComment": "Not mentioned",
            "AppealsProc": "N",
            "AppealsComment": "Not mentioned",
            "RuleReqs": "N",
            "RuleComment": "Not mentioned",
            "Exemptions": "N",
            "ExempComment": "Not mentioned",
            "Compensations": "N",
            "CompensComment": "Not mentioned",
            "DirectOversight": "N",
            "OversightComment": "Not mentioned",
            "Studies": "N",
            "Discretion_Rank": 0,
            "Final_Rationale": "The law amends the Securities Exchange Act to simplify registration requirements but does not delegate any new regulatory or standard-setting authority to the SEC. Thus, DelegateLaw is N and Discretion is 0."
        }
    },
    {
        "law_id": "92-221",
        "description": "PL 92-221 (1971): Federal Credit Union Act Amendments (HR9961).",
        "inputs": {
            "text": "SEC. 1. (b) Subsection (d) of section 201 of the Federal Credit Union Act is amended to read: 'In the case of any Federal credit union whose application for insurance is disapproved... the Administrator shall nonetheless issue a certificate of insurance valid for a period of two years... The Administrator shall, having regard to the purposes of this subsection, make every reasonable effort to prevent the closing of any Federal credit union which is insured... if he determines that with technical assistance and management training there is reasonable assurance that such difficulties can be resolved...'"
        },
        "outputs": {
            "DelegateLaw": "Y",
            "Delegees": "National Credit Union Administration (NCUA) Administrator",
            "NewAgencyCreated": "N",
            "ApptPower": "N",
            "ApptComment": "Not mentioned",
            "TimeLimits": "N",
            "TimeComment": "Not mentioned. (Note: The 2-year temporary insurance term is a program limitation on the credit unions, not a sunset/expiration of the Administrator's authority itself.)",
            "SpendLimits": "N",
            "SpendingComment": "Not mentioned",
            "LegAxnReq": "N",
            "LegAxnComment": "Not mentioned",
            "ExecAxnReq": "N",
            "ExecAxnComment": "Not mentioned",
            "LegVeto": "N",
            "VetoComment": "Not mentioned",
            "ReportReq": "N",
            "ReportComment": "Not mentioned",
            "Consultation": "N",
            "ConsultComment": "Not mentioned",
            "PubHearings": "N",
            "HearingComment": "Not mentioned",
            "AppealsProc": "N",
            "AppealsComment": "Not mentioned",
            "RuleReqs": "Y",
            "RuleComment": "Under section 201(d), the NCUA Administrator is given authority to issue insurance certificates and prevent credit union closures if he finds reasonable assurance of recovery within two years.",
            "Exemptions": "N",
            "ExempComment": "Not mentioned",
            "Compensations": "N",
            "CompensComment": "Not mentioned",
            "DirectOversight": "N",
            "OversightComment": "Not mentioned",
            "Studies": "N",
            "Discretion_Rank": 2,
            "Final_Rationale": "The Administrator is delegated authority to issue temporary certificates and coordinate stabilization efforts, representing real regulatory action. However, the scope is limited to technical assistance/preventing closings, representing limited discretion (Rank 2)."
        }
    },
    {
        "law_id": "93-224",
        "description": "PL 93-224 (1973): Federal Financing Bank Act of 1973 (HR5874).",
        "inputs": {
            "text": "SEC. 6. Required advance approval by the Treasury Secretary of the method, source, timing, terms and conditions carried by any obligations issued or sold by a federal agency. SEC. 7. Directed the Secretary to approve or disapprove a securities issue within 120 days. If the Secretary had not acted after 60 days, he was required to report his reasons for delay to Congress. SEC. 8. Exempted Farmers Home Administration rural housing securities from the requirement of prior Treasury Secretary approval."
        },
        "outputs": {
            "DelegateLaw": "Y",
            "Delegees": "Secretary of the Treasury",
            "NewAgencyCreated": "N",
            "ApptPower": "N",
            "ApptComment": "Not mentioned",
            "TimeLimits": "N",
            "TimeComment": "Not mentioned",
            "SpendLimits": "N",
            "SpendingComment": "Not mentioned",
            "LegAxnReq": "N",
            "LegAxnComment": "Not mentioned",
            "ExecAxnReq": "Y",
            "ExecAxnComment": "Section 6 requires advance approval by the Secretary of the Treasury for any obligations issued or sold by a federal agency.",
            "LegVeto": "N",
            "VetoComment": "Not mentioned",
            "ReportReq": "Y",
            "ReportComment": "Section 7 mandates that if the Secretary has not acted to approve/disapprove an issue after 60 days, he must report the reasons for delay to Congress.",
            "Consultation": "N",
            "ConsultComment": "Not mentioned",
            "PubHearings": "N",
            "HearingComment": "Not mentioned",
            "AppealsProc": "N",
            "AppealsComment": "Not mentioned",
            "RuleReqs": "Y",
            "RuleComment": "Secretary is authorized to approve or disapprove method, source, timing, terms and conditions of agency obligations.",
            "Exemptions": "Y",
            "ExempComment": "Section 8 explicitly exempts Farmers Home Administration rural housing securities from the Treasury Secretary approval requirement.",
            "Compensations": "N",
            "CompensComment": "Not mentioned",
            "DirectOversight": "N",
            "OversightComment": "Not mentioned",
            "Studies": "N",
            "Discretion_Rank": 2,
            "Final_Rationale": "The Secretary of the Treasury receives major regulatory power over agency securities (Rank 3 potential). However, because there are multiple heavy constraints—including a mandatory approval requirement, a statutory 120-day deadline, a 60-day reporting obligation to Congress for delays, and a structural exemption for the Farmers Home Administration—the discretion is bounded at Rank 2."
        }
    }
]


def get_few_shot_prompt_text() -> str:
    """Format the real-world exemplars into system-prompt readable text."""
    text = "=== REAL-WORLD CALIBRATING EXAMPLES (HUMAN BENCHMARKS) ===\n\n"
    for ex in FEW_SHOT_EXEMPLARS:
        text += f"Example Law: {ex['description']}\n"
        text += f"Input Text Segment:\n\"\"\"\n{ex['inputs']['text']}\n\"\"\"\n"
        text += "Expected Coding Output:\n"
        text += json.dumps(ex["outputs"], indent=2) + "\n\n"
        text += "----------------------------------------\n\n"
    return text
