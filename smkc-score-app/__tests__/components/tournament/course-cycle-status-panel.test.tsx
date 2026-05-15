/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { CourseCycleStatusPanel } from "@/components/tournament/course-cycle-status-panel";

describe("CourseCycleStatusPanel", () => {
  const translate = (key: string, values?: Record<string, number>) => {
    if (key === "courseCycleLabel") return "Course Cycle:";
    if (key === "courseCycleValue") return `Cycle ${values?.cycle} ${values?.played}/${values?.total}`;
    if (key === "availableCoursesLabel") return "Available Courses:";
    if (key === "availableCoursesValue") return `${values?.count}/${values?.total} courses`;
    if (key === "courseCycleHint") return `${values?.totalPlayed} total played`;
    return key;
  };

  it("renders the shared course-cycle display contract", () => {
    render(
      <CourseCycleStatusPanel
        t={translate}
        status={{
          cycleNumber: 2,
          playedInCycle: 7,
          totalCourses: 20,
          totalPlayed: 27,
        }}
        availableCoursesCount={13}
      />,
    );

    expect(screen.getByText("Course Cycle:")).toBeInTheDocument();
    expect(screen.getByText("Cycle 2 7/20")).toBeInTheDocument();
    expect(screen.getByText("Available Courses:")).toBeInTheDocument();
    expect(screen.getByText("13/20 courses")).toBeInTheDocument();
    expect(screen.getByText("27 total played")).toBeInTheDocument();
  });
});
