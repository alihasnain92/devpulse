-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_hashedRefreshToken_key" ON "refresh_sessions"("hashedRefreshToken");
