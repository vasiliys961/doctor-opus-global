/** Official ARISE SCT public 8-case cross-specialty sample.
 * Scoring labels are NEVER passed to the answering model.
 * Data: ARISENetwork/mast/benchmarks/sct/dataset (public).
 */
export const SCT_PILOT_CASES = [
  {
    "id": "1",
    "scenario": "A 66-year-old male is in hospital for an elective total hip replacement. He is 1 day post-op. During the night the patient complains of shortness of breath of 1 hour in duration. He has a past medical history of COPD and heart failure. His respiratory rate is 24 and O2 saturation is 93% on 10L of O2 via a non-rebreather mask. He has a temperature of 37.5ËC.",
    "hypothesis": "If you were thinking of: Ordering a blood culture",
    "new_information": "And then you find: He has diffuse coarse crackles in both lungs",
    "source": "Adelaide SCT",
    "expert_distribution": [
      0,
      0.4,
      0.8,
      1,
      0.2
    ]
  },
  {
    "id": "3",
    "scenario": "A 67-year-old female is brought to the emergency department after a witnessed unconscious collapse. She reports that she was walking up a hill when she began to feel dizzy before âblacking outâ and awakening on the ground. Her friend who witnessed the collapse reports observing that she lost consciousness for âa few secondsâ, during which she âmade a few jerking movementsâ.",
    "hypothesis": "If you were thinking of: Ordering an EEG",
    "new_information": "And then you find: Her friend reports the patient went very pale before losing consciousness",
    "source": "Adelaide SCT",
    "expert_distribution": [
      0,
      1,
      0.2,
      0,
      0
    ]
  },
  {
    "id": "6",
    "scenario": "A 25-year-old female presents to the ED with a headache. She describes the headache as poorly localised. The headache has been present for 2 days and has not been alleviated by paracetamol or NSAIDs. She has been having frequent headaches over the last month. She has no significant past medical history. Physical examination reveals a BMI of 32. Her neurological examination and CT head are normal.",
    "hypothesis": "If you were thinking of: Performing a lumbar puncture",
    "new_information": "And then you find: She has bilateral papilloedema",
    "source": "Adelaide SCT",
    "expert_distribution": [
      1,
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": "22",
    "scenario": "A 60-year-old female presents to the emergency department with weakness. She reports having difficulty arising from a seated position. The patient also reports that her arms get tired when she brushes her hair.",
    "hypothesis": "If you were thinking of: Myasthenia gravis",
    "new_information": "And then you find: She has decreased deep tendon reflexes throughout",
    "source": "Adelaide SCT",
    "expert_distribution": [
      1,
      0.7,
      0,
      0,
      0
    ]
  },
  {
    "id": "43",
    "scenario": "A 58-year-old female presents to the emergency department with severe epigastric pain for the past 12 hours. She reports that the pain radiates through to the center of her back. She has also been feeling nauseous and vomited twice. The vomit has contained only food.",
    "hypothesis": "If you were thinking of: Ordering serum lipase",
    "new_information": "And then you find: She is tachycardic and her temperature is 37.3ËC",
    "source": "Adelaide SCT",
    "expert_distribution": [
      0,
      0,
      0.5,
      1,
      0.2
    ]
  },
  {
    "id": "64",
    "scenario": "A 50-year-old female is brought to the emergency department following a motor vehicle accident. She suffered trauma to the right side of her body, particularly her right leg. She is now complaining of numbness in the right leg.",
    "hypothesis": "If you were thinking of: A lesion affecting the right sural nerve",
    "new_information": "And then you find: The right leg has an upgoing plantar response",
    "source": "Adelaide SCT",
    "expert_distribution": [
      1,
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": "290",
    "scenario": "You are called to the newborn nursery by the labor and delivery nurse to examine a newborn infant with abnormal tone, dysmorphic facial features and a heart murmur. You elicit further prenatal history from the motherâs chart, perform a complete physical examination on the infant and consider your further evaluation for this infant.",
    "hypothesis": "If you were considering ordering a:   Renal Ultrasound",
    "new_information": "And then on examination you find: A single umbilical artery",
    "source": "Open Medical SCT",
    "expert_distribution": [
      0,
      0,
      0,
      4,
      7
    ]
  },
  {
    "id": "332",
    "scenario": "A 2-year-old female has a 2-day history of left ear pain. Her mother has been giving her acetaminophen with temporary improvement in pain.",
    "hypothesis": "If you were thinking of a diagnosis of:   Acute Otitis Media",
    "new_information": "And then you find: A history of a runny nose and congestion",
    "source": "Open Medical SCT",
    "expert_distribution": [
      0,
      0,
      1,
      8,
      1
    ]
  }
] as const;
export const SCT_GUIDELINE = "# Script Concordance Testing\n\nYou are taking a Script Concordance Test, which evaluates your understanding of medical knowledge.\n\nIn this test, you will evaluate how new information impacts a specific hypothesis. Use the following scale to rate the impact:\n\n-2: Strongly decreases the likelihood of the hypothesis\n-1: Slightly decreases the likelihood of the hypothesis\n0: No effect on the likelihood of the hypothesis\n+1: Slightly increases the likelihood of the hypothesis\n+2: Strongly increases the likelihood of the hypothesis\n\n## Response format\n\nRespond with \"Rating: \" followed by a rating (-2, -1, 0, +1, +2) and a brief explanation for your choice. \n\nThis is an exam, and you are required to provide a valid answer.\n";
export const SCT_TESTCASE_TEMPLATE = "## Scenario\n\n{{ scenario }}\n\n## Hypothesis\n\n{{ hypothesis }}\n\n## Additional Information\n\n{{ additional information }}";
export function buildOfficialSctPrompt(item: typeof SCT_PILOT_CASES[number]): string {
  return SCT_GUIDELINE.replace(' and a brief explanation for your choice', '')
    + SCT_TESTCASE_TEMPLATE.replace('{{ scenario }}',item.scenario).replace('{{ hypothesis }}',item.hypothesis).replace('{{ additional information }}',item.new_information);
}
