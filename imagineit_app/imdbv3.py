
class IMDBv3:
    def __init__(self, path):
        self.path = path

    def write(self, data):
        with open(self.path, 'a') as f:
            f.write(data + '\n')

    def read(self):
        with open(self.path, 'r') as f:
            return f.readlines()