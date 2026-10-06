"""Reset the guided demo (both scenarios) from the command line.

    python -m scripts.demo
"""
from app.services import demo

if __name__ == "__main__":
    demo.reset()
    links = demo.scenario_links()
    print("Demo ready:")
    print(f"  Act 2 offers:      /client/projects/{links['offers_project_id']}")
    print(f"  Act 4 workspace:   /contracts/{links['gym_contract_id']}")
    print("  Guide:             /demo")
