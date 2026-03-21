.PHONY: start server client test stop

start: server client

server:
	./gradlew :applications:signaling-server:bootRun &

client:
	cd applications/web-client && npm run dev &

test:
	./gradlew test && cd applications/web-client && npm test

stop:
	@-pkill -f 'signaling-server' 2>/dev/null; true
	@-pkill -f 'vite' 2>/dev/null; true