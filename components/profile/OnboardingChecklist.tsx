type OnboardingChecklistProps = {
  hasName: boolean;
  hasSteam: boolean;
  hasDevice: boolean;
  hasTeam: boolean;
  isConfirmed: boolean;
  hasPushSubscription: boolean;
};

type ChecklistItem = {
  label: string;
  completed: boolean;
};

function ChecklistStatusBox({ completed }: { completed: boolean }) {
  if (completed) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center border-2 border-green-500 bg-green-500 text-sm font-black text-black">
        ✓
      </span>
    );
  }

  return (
    <span className="inline-flex h-7 w-7 items-center justify-center border-2 border-[#CD9C3E] bg-transparent text-sm font-black text-[#CD9C3E]">
      {" "}
    </span>
  );
}

export function OnboardingChecklist({
  hasName,
  hasSteam,
  hasDevice,
  hasTeam,
  isConfirmed,
  hasPushSubscription,
}: OnboardingChecklistProps) {
  const items: ChecklistItem[] = [
    {
      label: "Установить никнейм (будет заблокирован на время турнира)",
      completed: hasName,
    },
    {
      label: "Привязать аккаунт Steam",
      completed: hasSteam,
    },
    {
      label: "Привязать устройство (для входа)",
      completed: hasDevice,
    },
    {
      label: "Вступить в команду",
      completed: hasTeam,
    },
    {
      label: "Подтвердить участие в турнире",
      completed: isConfirmed,
    },
    {
      label: "Включить push-уведомления",
      completed: hasPushSubscription,
    },
  ];

  const completedSteps = items.filter((item) => item.completed).length;
  const isReadyForTournament = completedSteps === items.length;

  return (
    <div className="mb-6 border-2 border-[#CD9C3E] bg-[#0B3A4A] p-6 shadow-[4px_4px_0_#000]">
      <div className="flex flex-col gap-3 border-b border-white/20 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-black uppercase tracking-wide text-[#CD9C3E]">
          СТАТУС РЕГИСТРАЦИИ
        </h2>
        <p
          className={`text-sm font-black uppercase tracking-[0.16em] ${
            isReadyForTournament ? "text-green-400" : "text-white/75"
          }`}
        >
          {isReadyForTournament ? "ГОТОВ К ТУРНИРУ" : `${completedSteps}/6`}
        </p>
      </div>

      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-start gap-3">
            <ChecklistStatusBox completed={item.completed} />
            <p
              className={`text-sm font-bold leading-6 md:text-base ${
                item.completed ? "text-white/55" : "text-white"
              }`}
            >
              {item.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
