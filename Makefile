SHELL_FILES := $(shell find vm/ src/backend/ -name "*.sh")

.PHONY: check lint fmt fmt-fix install-tools lint-python test-python build-tarball build-frontend

TARBALL := nutwatch.tar.gz
TARBALL_DIR := src/backend

build-frontend:
	cd src/frontend && npm ci && npm run build

build-tarball: build-frontend
	tar -czvf $(TARBALL) \
		-C $(TARBALL_DIR) \
		--exclude '__pycache__' \
		--exclude '.pytest_cache' \
		--exclude 'venv' \
		--exclude 'tests' \
		--exclude 'install.sh' \
		__init__.py app.py auth.py config.py utils.py \
		parsers/ services/ routes/ \
		static/ scripts/ \
		nutwatch.service requirements.txt

check: lint fmt lint-python test-python

lint:
	shellcheck $(SHELL_FILES)

fmt:
	shfmt -d -i 2 $(SHELL_FILES)

fmt-fix:
	shfmt -w -i 2 $(SHELL_FILES)

lint-python:
	@for f in $$(find src/backend -name '*.py'); do python3 -m py_compile $$f || exit 1; done && echo "All Python files syntax OK"

test-python:
	cd src/backend && python3 -m pytest tests/ -v

install-tools:
	sudo apt-get install -y shellcheck shfmt python3-pytest nodejs npm
