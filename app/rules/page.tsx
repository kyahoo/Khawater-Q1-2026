export default function RulesPage() {
  return (
    <div className="min-h-screen pt-24 pb-12 px-4 md:px-8">
      <div className="bg-[#0B3A4A] border-[3px] border-[#061726] shadow-[8px_8px_0px_0px_#061726] max-w-4xl mx-auto p-6 md:p-10">
        <h1 className="text-4xl md:text-5xl font-black text-[#CD9C3E] uppercase mb-10 text-center">
          ПРАВИЛА ТУРНИРА
        </h1>

        <section>
          <h2 className="text-2xl font-bold text-[#CD9C3E] mb-4 uppercase">1. ОБЩИЕ ПОЛОЖЕНИЯ</h2>
          <div className="text-white text-base md:text-lg leading-relaxed mb-8">
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Турнир проходит в онлайн-формате. Формат матчей: 5х5, Captains Mode.</li>
              <li>Система проведения: Group Stage (Round Robin) и Плей-офф (Double Elimination).</li>
              <li>Формат серий: Матчи плей-офф — BO1/BO3. Гранд-финал — BO3.</li>
              <li>Суммарный рейтинг команды должен соответствовать требованиям организаторов.</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-[#CD9C3E] mb-4 uppercase">2. ТРЕБОВАНИЯ И ПРОВЕРКА ИГРОКОВ</h2>
          <div className="text-white text-base md:text-lg leading-relaxed mb-8">
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Один игрок может участвовать только в одной команде. Игроки обязаны иметь открытый Steam-аккаунт и открытый профиль Dotabuff.</li>
              <li><strong>Обязательная верификация:</strong> Все участники должны пройти проверку на платформе Khawater (Биометрия + OCR-проверка фото лобби).</li>
              <li>Игроки обязаны использовать строго свои зарегистрированные имена в лобби. Если система или админ выявит использование незарегистрированных имён, применяются штрафы.</li>
              <li>Замены должны быть зарегистрированы до начала турнира или одобрены админом. Замена запрещена в середине карты, но разрешена между картами в сериях BO2/BO3.</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-[#CD9C3E] mb-4 uppercase">3. РАСПИСАНИЕ И ЛОББИ</h2>
          <div className="text-white text-base md:text-lg leading-relaxed mb-8">
            <p className="mb-2 font-bold text-[#CD9C3E]">Настройки лобби:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Сервер: Стокгольм. Читы: Off. Delay DotaTV: 2 минуты. Зрители: разрешены. Выбор стороны: Coin toss.</li>
            </ul>
            <p className="mb-2 mt-4 font-bold text-[#CD9C3E]">Опоздание на матч:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>5 минут: -30 секунд штрафного времени на драфте.</li>
              <li>10 минут: -70 секунд штрафного времени и проигрыш coin-toss.</li>
              <li>15 минут: Техническое поражение.</li>
            </ul>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Между картами даётся до 10 минут, чтобы команды перешли в новое лобби.</li>
              <li>Перенос матчей разрешён только в групповом этапе (за 24 часа, при согласии обеих команд). В плей-офф переносы запрещены.</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-[#CD9C3E] mb-4 uppercase">4. ДИСЦИПЛИНА И ПОВЕДЕНИЕ</h2>
          <div className="text-white text-base md:text-lg leading-relaxed mb-8">
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Паузы:</strong> Команде даётся до 10 минут пауз на одну карту. После истечения лимита соперник имеет право отжать паузу.</li>
              <li><strong>Строго запрещено:</strong> Игра на чужом аккаунте, предоставление недостоверной информации, использование стороннего ПО/читов, нецензурная лексика, участие незарегистрированных игроков.</li>
              <li><strong>Наказания:</strong> Штрафные секунды на драфте, техническое поражение, дисквалификация или бан на все будущие турниры Khawater.</li>
              <li><strong>Переигровки:</strong> Назначаются только при массовом краше серверов Dota 2 или техническом сбое, подтверждённом админом. Лаги у одного игрока или личные проблемы причиной для переигровки не являются.</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-[#CD9C3E] mb-4 uppercase">5. ОТЧЕТНОСТЬ И РЕЗУЛЬТАТЫ</h2>
          <div className="text-white text-base md:text-lg leading-relaxed mb-8">
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Ввод результатов:</strong> После завершения серии Lobby Host обязан ввести итоговый счет матча на платформе Khawater и загрузить подтверждающие скриншоты финального табло для каждой сыгранной карты. Без загрузки скриншотов результат не будет засчитан.</li>
              <li><strong>Tie-break (Группы):</strong> При равенстве очков приоритет определяется по: 1) Head-to-Head, 2) Количеству выигранных карт, 3) Средней разнице Net Worth/минуту в проигранных картах. Побеждает команда с меньшей разницей.</li>
              <li>Любые экстренные вопросы и спорные ситуации решаются админами в официальной группе Khawater.</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
